# PRD — Composite Actions for Colour Within CI/CD

**Status:** Draft, ready to execute
**Owner:** `ColourWithin/.github` (this repo)
**Consumer:** `ColourWithin/colour-within-ops` (and later `colour-within-svc`) GitHub Actions workflows
**Date:** 2026-05-09

## Why this exists

`colour-within-ops` Phase 04 (CI/CD pipeline) was paused mid-execution after discovering two architectural defects in cycle-2:

1. The third-party action `gtrevorrow/oci-token-exchange-action` is unmaintained (last substantive release 2025-06-12), ships an unpatched `axios < 1.12.0` (CVE-2025-58754) in its bundled `dist/`, and produces a User Principal Session Token under an impersonated **Service User** — `principal.type = 'user'`, not `'workload'`.
2. The `oracle-actions/*` family that the project originally planned to use has not seen substantive commits since Nov–Dec 2024. The original author (now on the Colour Within team) no longer has Oracle org access and has chosen to replicate the relevant subset internally rather than continue depending on stale upstreams.

Plan: ship two first-party composite actions in this repo. `colour-within-ops` workflows will consume them via `uses: ColourWithin/.github/actions/<name>@<sha>`.

## Scope

Two composite actions, in this order of priority:

| # | Action path | Purpose | Replaces |
|---|---|---|---|
| 1 | `actions/oci-token-exchange` | Exchange GitHub Actions OIDC ID token for an OCI User Principal Session Token (UPST) and write OCI CLI / SDK config so subsequent steps authenticate as the impersonated Service User | `gtrevorrow/oci-token-exchange-action` |
| 2 | `actions/run-oci-cli-command` | Run an `oci` CLI command using the credentials prepared by action #1 (or any pre-existing OCI config), with stdout/stderr capture and credential redaction | `oracle-actions/run-oci-cli-command` |

**Out of scope** (consumer can use upstream alternatives directly):

- OCIR login → use `docker/login-action@v3` directly with a Vault-fetched OCIR auth token.
- OCIR repo lookup / management → already managed by `colour-within-ops` Tofu IaC.
- OKE kubeconfig → no OKE in this project.

---

## Action 1 — `actions/oci-token-exchange`

### Background

GitHub Actions can mint an OIDC ID token via `id-token: write` permission and the `ACTIONS_ID_TOKEN_REQUEST_TOKEN` / `ACTIONS_ID_TOKEN_REQUEST_URL` env vars (or the `@actions/core` `getIDToken()` helper). OCI Identity Domains can exchange that JWT for a UPST via the **Token Exchange Grant Type** when an **Identity Propagation Trust** is configured to trust `https://token.actions.githubusercontent.com` and map a claim (typically `sub`) to a Service User in the same domain.

Oracle ships a first-party `oci.auth.signers.TokenExchangeSigner` in the OCI Python SDK that performs this exchange and refreshes the UPST automatically. There is an [official example](https://github.com/oracle/oci-python-sdk/blob/master/examples/workload_identity_federation_signer_example.py) targeting GitHub Actions specifically.

### Inputs

| Name | Required | Default | Description |
|---|---|---|---|
| `client-identifier` | yes | — | OAuth `client_id` of the OCI Confidential Application that fronts the IPT. Sourced from `secrets.OCI_OIDC_CLIENT_IDENTIFIER`. |
| `client-secret` | yes | — | OAuth `client_secret` of the same Confidential Application. Sourced from `secrets.OCI_OIDC_CLIENT_SECRET`. |
| `domain-base-url` | yes | — | Identity Domain base URL, e.g. `https://idcs-XXXX.identity.oraclecloud.com`. Sourced from `vars.OCI_DOMAIN_BASE_URL`. |
| `audience` | no | `https://github.com/ColourWithin` | OIDC audience requested when minting the GitHub ID token. Must match the `audience` configured on the Identity Propagation Trust. |
| `region` | no | `ap-sydney-1` | OCI region the resulting CLI/SDK config targets. |
| `output-config-path` | no | `${HOME}/.oci/config` | Where to write the OCI CLI config. |
| `output-key-path` | no | `${HOME}/.oci/upst.pem` | Where to write the ephemeral private key matching the UPST's session public key. |

### Outputs

| Name | Description |
|---|---|
| `config-path` | Resolved absolute path to the OCI CLI config file written. |
| `expires-at` | ISO 8601 timestamp of UPST expiry. Useful for downstream steps deciding whether to re-exchange. |

### Behaviour

1. Mint a GitHub OIDC ID token for the configured `audience`. Use `@actions/core.getIDToken(audience)` from a small Node entrypoint OR the `curl`-against-`ACTIONS_ID_TOKEN_REQUEST_URL` pattern.
2. Generate an ephemeral RSA-2048 keypair (the public key gets attached to the UPST request; the private key signs subsequent OCI requests).
3. POST to `${domain-base-url}/oauth2/v1/token` with:
   - `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`
   - `requested_token_type=urn:oci:token-type:upst`
   - `subject_token=<github-jwt>`
   - `subject_token_type=jwt`
   - `public_key=<base64-DER-spki>`
   - HTTP Basic auth using `client-identifier` + `client-secret`.
4. Persist the returned UPST and the ephemeral private key to disk in OCI CLI config format:
   ```
   [DEFAULT]
   security_token_file=<path-to-upst-token>
   key_file=<output-key-path>
   region=<region>
   ```
5. Set `OCI_CLI_AUTH=security_token` for subsequent steps in the job, plus the `outputs` listed above.
6. Register the UPST string with `core.setSecret` so it never appears in logs. Same for `client-secret`.

### Error handling

- Missing `id-token: write` permission → fail fast with a clear message naming the workflow-level fix.
- 4xx from the token endpoint → fail and surface the OCI `error` and `error_description` fields verbatim. Do not retry on 4xx.
- 5xx or transient network failure → retry with exponential backoff, max 3 attempts, max ~10s total.

### Implementation choice

Pick **one** and document why in the action's README:

- **Option A — composite + Python:** `runs.using: composite`, steps shell into `python` with `oci` SDK `>=2.168` installed via `pip install --user`. Pros: tracks Oracle's first-party SDK exactly; refresh logic comes for free. Cons: ~5–8s install time per job (mitigatable via `actions/setup-python` cache).
- **Option B — composite + bash + curl:** zero Python dependency, just curl + `openssl` for the keypair. Pros: fastest cold start. Cons: have to maintain the token-exchange request shape and refresh logic ourselves; no upstream to track.

Recommendation: **Option A**. The project already has Python expertise; faithfulness to Oracle's reference example outweighs the ~5s setup cost, especially since deploy workflows aren't latency-sensitive. The action should `pip install oci` on every run unless a cache hit is detected; do not pin a specific patch version in the action — pin a minimum (`>=2.168,<3`).

### Consumer-side prerequisite

Workflow must include:

```yaml
permissions:
  id-token: write
  contents: read
```

Without this, no GitHub OIDC token is mintable and the action will fail at step 1.

---

## Action 2 — `actions/run-oci-cli-command`

### Background

Workflows need to call `oci` CLI commands as part of deployments — restart container instances, fetch secrets from Vault, push to OCIR, query state. The action should be a thin convenience wrapper that:

- Assumes credentials are already on disk (typically prepared by Action 1, but any pre-existing `~/.oci/config` works).
- Captures stdout/stderr cleanly into action outputs without leaking credentials in logs.
- Fails fast on non-zero exit unless the caller opts out.

### Inputs

| Name | Required | Default | Description |
|---|---|---|---|
| `command` | yes | — | The `oci ...` command to run. Multi-line strings supported; whitespace-trimmed. The leading `oci` is required (do **not** prepend it for the caller — that hides bugs). |
| `silent` | no | `false` | If `true`, do not echo the command before running. Use for commands whose arguments contain user-visible secrets. |
| `query` | no | — | Equivalent to passing `--query <value>` — convenience because most steps need it. Passed verbatim. |
| `working-directory` | no | `${{ github.workspace }}` | `cd` before running. |

### Outputs

| Name | Description |
|---|---|
| `output` | stdout of the command, trimmed. |
| `raw-output` | stdout of the command, untrimmed. |
| `exit-code` | Numeric exit code as a string (so callers can `==` compare). |

### Behaviour

1. Verify `oci --version` runs (it should — installed by Action 1, or by a separate `actions/setup-oci-cli` step). If not, fail with a message pointing at the install requirement.
2. Run the command with `bash -e -o pipefail`. Capture stdout to `outputs.output`, stderr to logs (always visible, redacted via `core.setSecret` calls inherited from Action 1).
3. On non-zero exit, fail the step. Do not attempt to interpret OCI errors.

### Why a thin wrapper at all

The action exists less for behaviour and more for **discoverability and consistency** — workflows shouldn't sprinkle raw `run: oci ...` shell steps with ad-hoc redaction patterns. One action with consistent inputs/outputs is easier to audit and easier to evolve (e.g. if we later want to add automatic retry on rate-limit errors).

### Implementation choice

Composite, bash-only. No Node, no Python. The whole thing should be ~30 lines of YAML.

---

## Repository layout

After this PRD is implemented, the repo structure should look like:

```
ColourWithin/.github/
├── actions/
│   ├── oci-token-exchange/
│   │   ├── action.yml
│   │   ├── README.md
│   │   ├── exchange.py            (if Option A)
│   │   └── requirements.txt       (if Option A)
│   └── run-oci-cli-command/
│       ├── action.yml
│       └── README.md
├── workflows/
│   └── test-actions.yml           (smoke test on PR; see "Verification" below)
├── ISSUE_TEMPLATE/                (existing)
├── PULL_REQUEST_TEMPLATE/         (existing)
└── PULL_REQUEST_TEMPLATE.md       (existing)
```

---

## Versioning and consumption

- Tag releases as `v1.0.0`, `v1.0.1`, etc. on this repo.
- Consumers pin by **commit SHA**, not tag, to satisfy the project's supply-chain hygiene preference. Tags exist for human readability only.
- Consumption pattern in `colour-within-ops`:
  ```yaml
  - uses: ColourWithin/.github/actions/oci-token-exchange@<sha>
    with:
      client-identifier: ${{ secrets.OCI_OIDC_CLIENT_IDENTIFIER }}
      client-secret:     ${{ secrets.OCI_OIDC_CLIENT_SECRET }}
      domain-base-url:   ${{ vars.OCI_DOMAIN_BASE_URL }}
  ```
- Note the doubled `.github` in the path: that's the cost of GitHub's "org-default repo must be named `.github`" rule.

---

## Verification

A `workflows/test-actions.yml` workflow on PR-to-main should:

1. Smoke test `oci-token-exchange` against a **personal-tenancy** Service User and IPT.
   - `colour-within-ops` Phase 02 IPT IaC (separate workstream, "B") creates the IPT and Service User and writes `OCI_OIDC_CLIENT_IDENTIFIER` / `OCI_OIDC_CLIENT_SECRET` / `OCI_DOMAIN_BASE_URL` to this repo's secrets/variables for testing.
   - The smoke test should call `oci iam region list` and assert exit code 0. If the UPST is invalid, the call fails.
2. Smoke test `run-oci-cli-command` chained off the same setup with a no-op command like `oci iam region list --query "data[0].name"`.

Both jobs must pass before merging. There is no offline / mocked test mode — the value of the action is in the OCI integration, so testing without OCI is testing the wrong thing.

---

## What this PRD does not decide

These are explicitly the consumer's (`colour-within-ops`) problem, not this repo's:

- The IPT, Service User, Group, Confidential Application, and policies in OCI — built via Tofu in `colour-within-ops/deploy/tofu/modules/identity/`.
- The `audience` value claim mapping — set on the IPT in OCI; this action just passes through whatever the consumer configures.
- How `OCI_OIDC_CLIENT_IDENTIFIER` and friends get populated into the consuming repo's GitHub Secrets — handled by a Tofu output → `gh secret set` runbook step in `colour-within-ops`.

---

## Sequencing

This work is **independent** of the OCI IaC work happening in `colour-within-ops`. They can proceed in parallel:

- This repo: build, smoke test, tag `v1.0.0`, capture commit SHAs.
- `colour-within-ops`: extend `deploy/tofu/modules/identity/` with IPT + Service User + Confidential App, ORM apply on personal tenancy, populate this repo's secrets via Tofu output → `gh secret set`.

Phase 04 cycle-3 in `colour-within-ops` consumes both: it pins the SHAs from this repo and uses the OCI artefacts from the Tofu apply.

---

## References

Verified live on 2026-05-09:

- [Token Exchange Grant Type — exchanging a JWT for a UPST](https://docs.oracle.com/en-us/iaas/Content/Identity/api-getstarted/json_web_token_exchange.htm) — canonical request shape
- [OCI CLI: `oci identity-domains identity-propagation-trust create`](https://docs.oracle.com/en-us/iaas/tools/oci-cli/latest/oci_cli_docs/cmdref/identity-domains/identity-propagation-trust/create.html)
- [Terraform `oci_identity_domains_identity_propagation_trust`](https://registry.terraform.io/providers/oracle/oci/latest/docs/resources/identity_domains_identity_propagation_trust)
- [Oracle Python SDK example — workload_identity_federation_signer_example.py](https://github.com/oracle/oci-python-sdk/blob/master/examples/workload_identity_federation_signer_example.py) — first-party GitHub Actions integration
- [GitHub Actions OIDC reference](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect)

Ateam blog posts (load fine in browser, return 403 to curl):

- [GitHub Actions & OCI: A Guide to Secure OIDC Token Exchange](https://www.ateam-oracle.com/github-actions-oci-a-guide-to-secure-oidc-token-exchange) — claim mapping examples
- [Automating OCI Workload Identity Federation with Terraform and Resource Manager](https://www.ateam-oracle.com/automating-oci-workload-identity-federation-with-terraform-and-resource-manager) — IPT-via-ORM canonical reference
