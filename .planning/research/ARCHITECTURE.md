# Architecture Research

**Domain:** GitHub composite actions — OCI OIDC token exchange and CLI wrapper
**Researched:** 2026-05-09
**Confidence:** HIGH (all structural decisions come directly from the PRD and verified GitHub Actions docs)

---

## System Overview

```
  Consumer workflow (colour-within-ops or colour-within-svc)
  ┌──────────────────────────────────────────────────────────────────┐
  │  permissions:                                                    │
  │    id-token: write        ← consumer MUST declare this          │
  │    contents: read                                                │
  │                                                                  │
  │  env / secrets from this repo (populated by colour-within-ops   │
  │  Tofu runbook, NOT by the action itself):                        │
  │    secrets.OCI_OIDC_CLIENT_IDENTIFIER                            │
  │    secrets.OCI_OIDC_CLIENT_SECRET                                │
  │    vars.OCI_DOMAIN_BASE_URL                                      │
  └──────────────┬───────────────────────────────────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Action 1 — actions/oci-token-exchange                          │
  │                                                                  │
  │  action.yml (composite)                                          │
  │    step 1: actions/setup-python (cache: pip)                     │
  │    step 2: pip install "oci>=2.168,<3"                           │
  │    step 3: python exchange.py                                    │
  │                                                                  │
  │  exchange.py                                                     │
  │    - getIDToken(audience) via ACTIONS_ID_TOKEN_REQUEST_URL       │
  │    - generate RSA-2048 keypair (cryptography / oci SDK)          │
  │    - POST ${domain-base-url}/oauth2/v1/token                     │
  │      (token-exchange grant, HTTP Basic client-id/secret)         │
  │    - write UPST + private key to output-key-path                 │
  │    - write OCI CLI config to output-config-path                  │
  │    - core.setSecret(upst), core.setSecret(client-secret)         │
  │    - echo config-path >> $GITHUB_OUTPUT                          │
  │    - echo expires-at  >> $GITHUB_OUTPUT                          │
  │    - echo OCI_CLI_AUTH=security_token >> $GITHUB_ENV             │
  │                                                                  │
  │  Outputs:                                                        │
  │    config-path   (absolute path to ~/.oci/config)                │
  │    expires-at    (ISO 8601 UPST expiry)                          │
  │                                                                  │
  │  Env side-effects (available to all subsequent steps in job):    │
  │    OCI_CLI_AUTH=security_token                                   │
  │    masked: UPST value, client-secret value                       │
  └──────────────┬──────────────┬───────────────────────────────────┘
                 │              │
         on-disk state          env var
                 │              │
  ~/.oci/config  │              │ OCI_CLI_AUTH=security_token
  ~/.oci/upst.pem│              │
                 ▼              ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Action 2 — actions/run-oci-cli-command                         │
  │  (or any raw `run: oci ...` step — Action 2 is optional)        │
  │                                                                  │
  │  action.yml (composite, bash-only, ~30 lines)                    │
  │    step 1: verify `oci --version` (fail fast if not installed)   │
  │    step 2: cd working-directory                                  │
  │    step 3: run command with bash -e -o pipefail                  │
  │             capture stdout → outputs.output / raw-output         │
  │             stderr → visible in logs (already masked by env)     │
  │    step 4: propagate exit-code to outputs.exit-code              │
  │                                                                  │
  │  Outputs:                                                        │
  │    output       (stdout, trimmed)                                │
  │    raw-output   (stdout, untrimmed)                              │
  │    exit-code    (numeric string)                                 │
  └──────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: GH OIDC → Action 1 → OCI Config → Action 2

### Full sequence

```
GitHub OIDC provider
  (ACTIONS_ID_TOKEN_REQUEST_URL + ACTIONS_ID_TOKEN_REQUEST_TOKEN)
        │
        │  exchange.py calls getIDToken(audience)
        │  audience = "https://github.com/ColourWithin" (default)
        ▼
  GitHub-signed JWT (sub = repo:ColourWithin/colour-within-ops:ref:refs/heads/main)
        │
        │  exchange.py generates RSA-2048 keypair in memory
        │
        ▼
  POST ${OCI_DOMAIN_BASE_URL}/oauth2/v1/token
    grant_type       = urn:ietf:params:oauth:grant-type:token-exchange
    requested_token_type = urn:oci:token-type:upst
    subject_token    = <github-jwt>
    subject_token_type = urn:ietf:params:oauth:token-type:jwt
    public_key       = base64(DER-encoded SPKI of ephemeral public key)
    Authorization    = Basic <client-id>:<client-secret>
        │
        │  OCI Identity Domain checks IPT claim mapping
        │  (sub → Service User — configured in OCI, not in this action)
        ▼
  OCI UPST (User Principal Session Token)
        │
        │  exchange.py writes to disk:
        ├──► ~/.oci/upst.pem          (the UPST token text)
        ├──► ~/.oci/oci_private_key.pem  (ephemeral RSA private key)
        └──► ~/.oci/config
               [DEFAULT]
               security_token_file=~/.oci/upst.pem
               key_file=~/.oci/oci_private_key.pem
               region=ap-sydney-1
        │
        │  exchange.py writes to runner environment:
        ├──► $GITHUB_OUTPUT: config-path=~/.oci/config
        ├──► $GITHUB_OUTPUT: expires-at=<iso8601>
        └──► $GITHUB_ENV:   OCI_CLI_AUTH=security_token
        │
        │  (OCI_CLI_AUTH=security_token now visible to all subsequent steps)
        ▼
  Action 2 (or any `run: oci ...` step)
    oci iam region list   ← reads ~/.oci/config automatically
                            uses OCI_CLI_AUTH=security_token from env
        │
        ▼
  stdout captured → outputs.output / raw-output
  exit-code → outputs.exit-code
```

### What passes between the two actions

| Channel | What | Written by | Read by |
|---------|------|-----------|---------|
| Filesystem | `~/.oci/config` | Action 1 (`exchange.py`) | OCI CLI (automatic), Action 2 |
| Filesystem | `~/.oci/upst.pem` | Action 1 (`exchange.py`) | OCI CLI (via config reference) |
| Filesystem | `~/.oci/oci_private_key.pem` | Action 1 (`exchange.py`) | OCI CLI (via config reference) |
| `$GITHUB_ENV` | `OCI_CLI_AUTH=security_token` | Action 1 (`exchange.py` via `$GITHUB_ENV`) | OCI CLI in any subsequent step |
| `$GITHUB_OUTPUT` | `config-path`, `expires-at` | Action 1 (`exchange.py` via `$GITHUB_OUTPUT`) | Consumer workflow (optional) |
| masked secrets | UPST value, client-secret | Action 1 (`core.setSecret`) | Log redaction engine |

Action 2 has **no direct input dependency on Action 1's outputs** — it reads from the filesystem and environment that Action 1 left behind. A consumer can also use raw `run: oci ...` steps instead of Action 2; the OCI CLI config and `OCI_CLI_AUTH` env var are sufficient.

---

## Component Boundaries

### What Action 1 owns
- Minting the GitHub OIDC token
- RSA-2048 keypair generation
- The token-exchange HTTP request (error handling, retry logic)
- Writing all three on-disk artefacts (`config`, `upst.pem`, `oci_private_key.pem`)
- Registering UPST and client-secret as masked secrets
- Setting `OCI_CLI_AUTH` in `$GITHUB_ENV`
- Exposing `config-path` and `expires-at` as action outputs

### What Action 1 does NOT own
- Installing the OCI CLI (consumer or a separate setup step)
- IPT configuration in OCI (Tofu in `colour-within-ops`)
- Claim mapping (service user mapping — configured on the IPT in OCI)
- Secret population (`OCI_OIDC_CLIENT_IDENTIFIER`, etc. — Tofu runbook in `colour-within-ops`)

### What Action 2 owns
- Verifying the OCI CLI is installed (fail-fast guard)
- `cd` to `working-directory`
- Running `oci ...` with `bash -e -o pipefail`
- Capturing stdout into action outputs
- Propagating exit code

### What Action 2 does NOT own
- Authentication setup (delegated entirely to Action 1 via env + filesystem)
- Interpreting OCI error responses (surfaces them as-is via stderr)
- Installing the OCI CLI

---

## Integration Points

### Consumer workflow must declare

```yaml
permissions:
  id-token: write   # required — without this GitHub will not mint an OIDC token
  contents: read    # required for actions/checkout
```

This must be at the **workflow level** or the **job level**. It cannot be granted inside an action. Action 1 will fail fast with a clear message if the token cannot be minted.

### Secrets and variables (provided by `colour-within-ops` Tofu runbook)

| Name | Type | Used in |
|------|------|---------|
| `OCI_OIDC_CLIENT_IDENTIFIER` | Secret | Action 1 `client-identifier` input |
| `OCI_OIDC_CLIENT_SECRET` | Secret | Action 1 `client-secret` input |
| `OCI_DOMAIN_BASE_URL` | Variable (not secret) | Action 1 `domain-base-url` input |

These must be populated in the consuming repo's GitHub Secrets/Variables by the `colour-within-ops` Tofu runbook before any workflow using these actions can succeed.

### Consumption pattern (SHA-pinned)

```yaml
steps:
  - uses: ColourWithin/.github/actions/oci-token-exchange@<sha>
    with:
      client-identifier: ${{ secrets.OCI_OIDC_CLIENT_IDENTIFIER }}
      client-secret:     ${{ secrets.OCI_OIDC_CLIENT_SECRET }}
      domain-base-url:   ${{ vars.OCI_DOMAIN_BASE_URL }}

  - uses: ColourWithin/.github/actions/run-oci-cli-command@<sha>
    id: list-regions
    with:
      command: oci iam region list
      query:   "data[0].name"

  - run: echo "Region = ${{ steps.list-regions.outputs.output }}"
```

Note the doubled `.github` in the `uses` path — required by GitHub's org-default repo rule.

---

## File-Level Component Map

### Action 1 — `actions/oci-token-exchange/`

| File | Role |
|------|------|
| `action.yml` | Composite action entrypoint. Declares inputs, outputs. Steps: setup-python → pip install → python exchange.py. Passes all inputs as env vars to the Python script. Writes `$GITHUB_ENV` and `$GITHUB_OUTPUT`. |
| `exchange.py` | Python module containing all token-exchange logic: OIDC token fetch, RSA keygen, HTTP POST with retry, disk writes, secret masking. Self-contained; no other Python files needed. |
| `requirements.txt` | Pins `oci>=2.168,<3`. Used by the `pip install` step. Keeps the install reproducible. |
| `README.md` | Consumer-facing docs: inputs/outputs table, example workflow snippet, permission requirements, SHA-pin pattern, notes on OCI side configuration needed. |

### Action 2 — `actions/run-oci-cli-command/`

| File | Role |
|------|------|
| `action.yml` | Composite action, bash-only, ~30 lines. Declares inputs (`command`, `silent`, `query`, `working-directory`) and outputs (`output`, `raw-output`, `exit-code`). All logic inline in YAML shell steps. |
| `README.md` | Consumer-facing docs: inputs/outputs table, example usage chained after Action 1, note about `oci` being a prerequisite. |

### Test workflow — `workflows/test-actions.yml`

| File | Role |
|------|------|
| `workflows/test-actions.yml` | PR smoke test. Single job. Requires real OCI credentials (no mock mode). Fails PR merge if either action fails. |

---

## `workflows/test-actions.yml` — Smoke Test Structure

```yaml
name: Test composite actions

on:
  pull_request:
    branches: [main]
    paths:
      - 'actions/**'
      - 'workflows/test-actions.yml'

permissions:
  id-token: write
  contents: read

jobs:
  smoke-test:
    name: OCI token exchange + CLI command
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@<sha>

      # ── Action 1: exchange OIDC token for UPST ───────────────────
      - name: Exchange OIDC token
        id: token-exchange
        uses: ColourWithin/.github/actions/oci-token-exchange@${{ github.sha }}
        with:
          client-identifier: ${{ secrets.OCI_OIDC_CLIENT_IDENTIFIER }}
          client-secret:     ${{ secrets.OCI_OIDC_CLIENT_SECRET }}
          domain-base-url:   ${{ vars.OCI_DOMAIN_BASE_URL }}
        # audience and region use defaults (ColourWithin org + ap-sydney-1)

      # ── Diagnostic: confirm config path output ───────────────────
      - name: Show config path
        run: echo "OCI config at ${{ steps.token-exchange.outputs.config-path }}"

      # ── Action 2: smoke-test the UPST with a read-only OCI call ─
      - name: Run OCI CLI command (region list)
        id: region-list
        uses: ColourWithin/.github/actions/run-oci-cli-command@${{ github.sha }}
        with:
          command: oci iam region list
          query: "data[0].name"

      # ── Assert: exit code 0 means UPST was accepted by OCI ──────
      - name: Assert exit code
        run: |
          if [ "${{ steps.region-list.outputs.exit-code }}" != "0" ]; then
            echo "OCI CLI returned non-zero exit code"
            exit 1
          fi
          echo "Region: ${{ steps.region-list.outputs.output }}"
```

**Key design notes for the test workflow:**

- Uses `@${{ github.sha }}` to self-reference — the workflow tests the exact code in the PR, not a previously tagged version.
- The `paths:` filter means the workflow only triggers when action files or the workflow itself change. Non-action PRs (e.g. README edits to community health files) are not blocked by a required OCI credential.
- No matrix strategy needed at v1.0 — both actions are exercised in a single linear job.
- The `OCI_OIDC_CLIENT_IDENTIFIER`, `OCI_OIDC_CLIENT_SECRET`, and `OCI_DOMAIN_BASE_URL` values are populated into **this repo's** (`ColourWithin/.github`) secrets/variables by the `colour-within-ops` Tofu runbook — they reference a personal-tenancy IPT, not the production tenant.
- If secrets are absent, Action 1 will fail with a clear error; the workflow is gated on the Tofu runbook having run first (per `colour-within-ops` Phase 02 B workstream).

---

## Build Order and Dependency Analysis

### Runtime dependency

Action 2 **at runtime** depends on on-disk state written by Action 1. They cannot be used in reverse order in the same job.

### Development dependency

Action 2 **at development time** has no dependency on Action 1 — its code is self-contained bash in `action.yml`. Both actions can be written in parallel.

### Recommended build order (phases)

**Phase 1 — Action 1 (`oci-token-exchange`)**
Build first because:
- It is the critical path (no OCI auth = nothing else works)
- It has the only complex logic (`exchange.py`, error handling, retry, secret masking)
- It must exist before the smoke test can exercise Action 2 in a real integration
- The test workflow's gating credential (UPST acceptance) validates Action 1 exclusively

**Phase 2 — Action 2 (`run-oci-cli-command`)**
Build second because:
- It is ~30 lines of bash in YAML; low implementation effort
- It can be stub-developed in parallel with Phase 1, but the integration test requires Action 1 to be functional first
- Smoke-testing Action 2 meaningfully requires a live UPST from Action 1

**Phase 3 — `workflows/test-actions.yml` + tag `v1.0.0`**
Last because:
- Both action files must exist and pass a basic lint/check before the PR-gating workflow can be evaluated
- SHA capture for consumer consumption patterns requires the tag to exist
- The test workflow and tag can be delivered in the same phase (they are a small unit)

However, the test workflow **file** can be written in Phase 1 or 2 as a skeleton (it is just YAML). Making it a required check on PRs only becomes meaningful once both action files exist and the OCI credentials are available in this repo's secrets.

---

## Architectural Patterns

### Pattern 1: Composite + External Script (Action 1)

**What:** `action.yml` uses `runs: using: composite` and delegates all logic to `exchange.py`. The YAML steps are: setup runtime, install dependencies, invoke script. The script reads inputs via env vars (passed by the YAML step's `env:` block).

**When to use:** When logic exceeds ~20 lines, requires imports, or needs structured error handling. The script is testable independently of the GitHub Actions runner.

**Trade-offs:** Adds a `setup-python` step (~2–3s) and a `pip install` step (~5–8s, cacheable). Acceptable for deploy workflows that are not latency-sensitive.

### Pattern 2: Composite + Inline Bash (Action 2)

**What:** All logic lives as `run:` steps directly in `action.yml`. No external script file. Outputs written via `echo "key=value" >> $GITHUB_OUTPUT`.

**When to use:** When the action is a thin wrapper (orchestration, not logic). Eliminates runtime setup overhead entirely.

**Trade-offs:** YAML is a poor language for anything non-trivial. Hard to test offline. Fine at ~30 lines.

### Pattern 3: `$GITHUB_ENV` for cross-step environment propagation

**What:** Action 1 writes `OCI_CLI_AUTH=security_token` to `$GITHUB_ENV`. All subsequent steps in the **same job** see this env var automatically — including Action 2 and any raw `run:` steps. This is the standard GitHub Actions mechanism for environment side-effects.

**Constraint:** `$GITHUB_ENV` changes are scoped to the current **job**. They do not cross jobs. If a consumer runs token exchange in one job and OCI CLI commands in another, they must call Action 1 again in the second job.

---

## Anti-Patterns

### Anti-Pattern 1: Action 2 attempting to install or configure the OCI CLI

**What people do:** Bundle `pip install oci-cli` or equivalent into the wrapper action to make it "self-contained."

**Why it's wrong:** Adds 60–90s of install time to every step invocation. The OCI CLI should be installed once per job, not once per `oci` command.

**Do this instead:** Document in Action 2's README that `oci` must be on `$PATH`. Consumer installs once via `oracle-actions/setup-oci-cli` or equivalent before calling Action 1.

### Anti-Pattern 2: Using `${{ steps.token-exchange.outputs.config-path }}` as the only coupling mechanism

**What people do:** Explicitly pass `config-path` output from Action 1 to Action 2 as an input.

**Why it's wrong:** Action 2 does not need it — the OCI CLI reads `~/.oci/config` by default and `OCI_CLI_AUTH` from the environment. Explicit coupling creates a false hard dependency and breaks consumer workflows that use raw `run:` steps instead of Action 2.

**Do this instead:** Leave the filesystem and `$GITHUB_ENV` as the sole coupling mechanism. `config-path` output exists for consumers who need to know the path for non-standard config locations.

### Anti-Pattern 3: Placing `id-token: write` inside the action's own metadata

**What people do:** Try to declare permissions in `action.yml` to avoid requiring consumers to know about it.

**Why it's wrong:** GitHub Actions does not support permission declarations in `action.yml`. Permissions can only be set at the workflow or job level in the consumer's workflow file. The action can only fail fast and explain what the consumer must add.

**Do this instead:** Document the required permissions prominently in Action 1's README, and add a step that checks for the token and fails with a clear message if absent.

### Anti-Pattern 4: Retrying on 4xx responses from the token endpoint

**What people do:** Treat all token endpoint failures the same and retry uniformly.

**Why it's wrong:** 4xx errors (invalid credentials, misconfigured IPT, wrong audience) are configuration problems that will not resolve on retry. Retrying wastes time and obscures the root cause.

**Do this instead:** Fail immediately on 4xx; surface the OCI `error` and `error_description` fields verbatim. Reserve retry (exponential backoff, max 3 attempts, ~10s total) for 5xx/transient network failures only.

---

## Scalability Considerations

This is not a web service — scaling is irrelevant. The only "scale" question is job concurrency:

| Scenario | Consideration |
|----------|--------------|
| Multiple concurrent jobs in the same workflow | Each job gets its own runner; OCI config on disk is per-runner; no contention |
| Same workflow called from multiple repos | Each repo calls Action 1 independently; no shared state |
| UPST expiry across long jobs | UPST lifetime is OCI-configured (typically 1h); for jobs approaching that limit, consider re-calling Action 1 mid-job |

---

## Integration Points Summary

| Integration Point | Owner | Notes |
|------------------|-------|-------|
| `permissions: id-token: write` | Consumer workflow | Must be at workflow or job level; action cannot grant this |
| `OCI_OIDC_CLIENT_IDENTIFIER` secret | `colour-within-ops` Tofu runbook | Written to `ColourWithin/.github` repo secrets |
| `OCI_OIDC_CLIENT_SECRET` secret | `colour-within-ops` Tofu runbook | Written to `ColourWithin/.github` repo secrets |
| `OCI_DOMAIN_BASE_URL` variable | `colour-within-ops` Tofu runbook | Written to `ColourWithin/.github` repo variables |
| OCI CLI on `$PATH` | Consumer or pre-step | Not installed by either action |
| IPT + Service User + Confidential App | OCI IaC (`colour-within-ops` Phase 02 B) | Prerequisite for token exchange to succeed |
| SHA-pinned `uses:` reference | Consumer workflow | SHA captured after `v1.0.0` tag is created |

---

## Sources

- [GitHub Actions: Create a composite action](https://docs.github.com/en/actions/tutorials/create-actions/create-a-composite-action) — HIGH confidence, official docs, verified via Context7
- [GitHub Actions: OIDC reference — permissions requirements](https://docs.github.com/en/actions/reference/openid-connect-reference) — HIGH confidence, verified via Context7
- [OCI Token Exchange Grant Type](https://docs.oracle.com/en-us/iaas/Content/Identity/api-getstarted/json_web_token_exchange.htm) — HIGH confidence (referenced and verified as live in PRD 2026-05-09)
- [Oracle Python SDK — workload_identity_federation_signer_example.py](https://github.com/oracle/oci-python-sdk/blob/master/examples/workload_identity_federation_signer_example.py) — HIGH confidence, first-party Oracle reference
- [PRD-composite-actions.md](../../PRD-composite-actions.md) — primary specification source, 2026-05-09
- [.planning/PROJECT.md](../PROJECT.md) — project constraints and key decisions

---

*Architecture research for: ColourWithin/.github v1.0 OCI composite actions*
*Researched: 2026-05-09*
