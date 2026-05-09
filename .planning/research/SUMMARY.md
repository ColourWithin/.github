# Project Research Summary

**Project:** ColourWithin/.github — OCI Composite Actions v1.0
**Domain:** GitHub composite actions — OIDC token exchange and CLI wrapper
**Researched:** 2026-05-09
**Confidence:** HIGH

## Executive Summary

This project ships two first-party GitHub composite actions that replace stale third-party alternatives: `actions/oci-token-exchange` exchanges a GitHub Actions OIDC ID token for an OCI User Principal Session Token (UPST) via an Identity Propagation Trust, and `actions/run-oci-cli-command` wraps the `oci` CLI with consistent output capture and credential redaction. The motivation is concrete: `gtrevorrow/oci-token-exchange-action` carries an unpatched CVE (axios < 1.8.1), produces a `principal.type = 'user'` UPST instead of `'workload'`, and is unmaintained; the `oracle-actions/*` family has had no substantive commits since late 2024. Building first-party means owning a minimal, auditable surface that tracks Oracle's reference SDK pattern exactly.

The recommended implementation uses the composite + Python pattern for Action 1 (using `oci.auth.signers.TokenExchangeSigner` from `oci>=2.173.1,<3`) and composite + bash-only for Action 2 (~30 lines of YAML). The runner default Python 3.12.3 on `ubuntu-24.04` is sufficient for Action 1 — no `setup-python` step is needed inside the composite action, and doing so would trigger a known unresolved caching bug (actions/setup-python#377). OCI CLI is not pre-installed on ubuntu-24.04 runners and must be installed explicitly; Action 2 guards with `oci --version` and fails fast rather than silently failing on a missing binary.

The dominant risk cluster is credential leakage and misconfiguration silence. The multiline-secret masking bug in the GitHub Actions toolkit (issue #1421) means `setSecret` silently fails on strings with embedded newlines — the UPST must be `.strip()`'d before registration. The wrong `requested_token_type` value (`urn:oci:token-type:upst` vs the correct `urn:oci:token-type:oci-upst` with the `oci-` infix) produces a generic 400 that does not name the offending field. The Oracle SDK example uses audience `"github-actions"` as a placeholder — the real audience must be `https://github.com/ColourWithin` to match the IPT's `allowedTokenAudiences`. Most critically, the smoke test must call a permission-scoped OCI API (not just `oci iam region list`, which succeeds for any authenticated principal regardless of principal type) to catch the `allowImpersonation: false` defect that silently produces a `user`-typed UPST instead of `workload`.

---

## Key Findings

### Recommended Stack

Action 1 is composite + Python using the `oci` SDK (`>=2.173.1,<3`). The version floor is set by the first release containing `TokenExchangeSigner`; the `<3` upper bound guards against breaking major-version changes. All other deps (`cryptography`, `urllib3`, `pyOpenSSL`, etc.) are transitive — do not pin them directly. The runner provides Python 3.12.3 pre-installed; no `setup-python` step belongs inside the composite action. Action 2 requires no Python at all.

OCI CLI is not pre-installed on `ubuntu-24.04` runners and must be `pip install oci-cli` explicitly, either by Action 1 (preferred: sentinel-file pattern to avoid reinstalling per step) or by the consumer as a pre-step. The oracle-actions sentinel-file pattern (`~/.oci-cli-installed`) is the reference.

For the smoke test workflow only: use `actions/cache@v5.0.5` (SHA `27d5ce7f`) pointed at `~/.cache/pip` for pip caching — not `setup-python`'s `cache: pip` input, which is broken inside composite action contexts.

**Core technologies:**
- `oci>=2.173.1,<3` (Python SDK): Token exchange via `TokenExchangeSigner` — Oracle first-party reference; pure-Python wheel works on runner default Python 3.12.3
- `oci-cli>=3.81.1`: `oci` binary for Action 2 — NOT pre-installed on ubuntu-24.04; must be installed explicitly via pip
- Python 3.12.3 (runner default): Action 1 runtime — no `setup-python` needed; avoids cold-start and the composite-action caching bug
- `actions/checkout@v6.0.2` (SHA `de0fac2e`): Required for smoke test workflow checkout
- `actions/cache@v5.0.5` (SHA `27d5ce7f`): pip cache in smoke test — preferred over `setup-python`'s broken cache input

**What NOT to use:**
- `gtrevorrow/oci-token-exchange-action` — CVE-2025-58754, wrong principal type, unmaintained
- `oracle-actions/run-oci-cli-command` — no commits since Nov–Dec 2024; original author has no Oracle org access
- `actions/setup-python` cache inside composite action — broken (issue #377, unresolved)
- Exact patch-version pin of `oci` — defeats upstream security patch delivery

### Expected Features

All P1 features are table stakes that must ship in v1.0. They are sequenced by their dependency chain: OIDC token minting is the foundation; masking must precede any other output; config write depends on a successful exchange; Action 2 depends on the config on disk.

**Must have (table stakes — v1.0):**
- OIDC ID token minting with explicit `id-token: write` permission guard and clear error message
- UPST and `client-secret` masking via `setSecret` — must be the first operation, before any subprocess
- Token exchange POST with 4xx fail-fast (surface `error` + `error_description` verbatim) and 5xx exponential backoff (3 attempts, ~10s)
- Ephemeral RSA-2048 keypair generation — handled internally by `TokenExchangeSigner`
- OCI CLI config file write (`security_token_file`, `key_file`, `region`) + `OCI_CLI_AUTH=security_token` in `$GITHUB_ENV`
- `config-path` and `expires-at` outputs on Action 1
- `oci --version` guard on Action 2 — fail fast with a helpful message if absent
- `command`, `silent`, `query`, `working-directory` inputs on Action 2
- `output`, `raw-output`, `exit-code` outputs on Action 2
- `bash -e -o pipefail` execution on Action 2
- Smoke test workflow (`workflows/test-actions.yml`) gated on PR merge

**Should have (v1.x after validation):**
- `workload` principal type assertion — decode returned UPST JWT, assert `principal.type == 'workload'`, fail with diagnostic if not. Currently deferred; the smoke test's permission-scoped API call catches it indirectly.
- `expires-at` proximity warning for tokens expiring within 10 minutes of job start
- 429 rate-limit retry in `run-oci-cli-command`

**Defer (v2+):**
- Post-job UPST file cleanup — composite actions have no native `post:` step; would require switching Action 1 to a JavaScript action or accepting a third-party `post-run` dependency. UPSTs expire within 60 min; GitHub-hosted runners are ephemeral VMs. Not worth the complexity.
- Multi-tenancy first-class support (named profiles, `OCI_CLI_CONFIG_FILE` management)

**Explicit anti-features (do not build):**
- UPST refresh loop for long-running jobs — OCI CLI has a known unfixed bug (oracle/oci-cli#998) where a running `oci` process does not reload the token file mid-execution; building refresh creates false safety. Document the 60-min ceiling instead.
- Default-masked output in `run-oci-cli-command` — `setSecret` already masks UPST values wherever they appear in logs. Default `silent: false`.
- Offline/mock test mode — value is in OCI integration; mock tests would test YAML plumbing, not the exchange.

### Architecture Approach

Two fully independent composite actions share state exclusively through the runner filesystem (`~/.oci/config`, `~/.oci/upst.pem`, `~/.oci/oci_private_key.pem`) and a single `$GITHUB_ENV` entry (`OCI_CLI_AUTH=security_token`). Action 2 has zero explicit input dependency on Action 1's outputs at development time — it works with any pre-existing OCI config. Action 1 is composite + external Python script (`exchange.py`); Action 2 is composite + inline bash, targeting ~30 lines of YAML. The smoke test workflow self-references using `@${{ github.sha }}` so PRs test the exact code under review, not a previously tagged version.

**Major components:**
1. `actions/oci-token-exchange/action.yml` + `exchange.py` — composite entrypoint wiring inputs to env vars; Python script owns all token-exchange logic (OIDC mint, RSA keygen, HTTP POST with retry, disk writes, secret masking, output emission)
2. `actions/oci-token-exchange/requirements.txt` — single direct dep: `oci>=2.173.1,<3`
3. `actions/run-oci-cli-command/action.yml` — bash-only composite; CLI version guard, `cd`, `bash -e -o pipefail` execution, stdout capture to outputs, exit-code propagation
4. `workflows/test-actions.yml` — PR smoke test; `paths:` filter limits trigger to `actions/**` changes; `@${{ github.sha }}` self-reference; requires real OCI credentials (no mock)

**Structural constraints that shape every implementation decision:**
- Composite actions have no native `post:` step — cleanup must happen at the workflow level with `if: always()`
- Composite actions do not support `if: failure()` on steps within the action
- `$GITHUB_ENV` is job-scoped — environment side-effects do not cross jobs; consumers running token exchange in one job and OCI CLI commands in another must call Action 1 again in the second job
- `${{ inputs.x }}` inline in shell `run:` bodies is a script injection vector — all inputs must go through env vars

### Critical Pitfalls

1. **UPST multiline masking failure (toolkit#1421)** — `setSecret` silently fails on strings containing `\n`; registers no mask and emits no warning. Prevention: `.strip()` the UPST before `setSecret`; register `client-secret` as the absolute first operation before any subprocess. Verification: grep smoke-test log for any `eyJ` substring; must be absent.

2. **Wrong `requested_token_type` literal** — `urn:oci:token-type:upst` (missing `oci-` infix) produces a generic 400 that does not name the offending field. The correct value is `urn:oci:token-type:oci-upst`. The PRD uses the shorter form — the Python source must use the canonical longer form. Add an assertion test that the literal appears verbatim in `exchange.py`.

3. **Audience default vs Oracle SDK example placeholder** — The Oracle SDK example uses `"github-actions"` as a placeholder. The action default must be `https://github.com/ColourWithin` to match the IPT's `allowedTokenAudiences`. A mismatch produces a generic 400 whose `error_description` does not name which claim failed.

4. **`allowImpersonation: false` produces `principal.type = 'user'` silently** — the exact defect in `gtrevorrow`. Token exchange succeeds; `oci iam region list` exits 0; resource-level calls governed by `request.principal.type='workload'` policies silently deny. The smoke test must call a permission-scoped API — `oci iam region list` alone is insufficient. The `colour-within-ops` Phase 02 B IPT Tofu resource must set `allow_impersonation = true` and configure `impersonation_service_users`.

5. **Script injection via `${{ inputs.command }}` in Action 2** — GitHub template expressions are evaluated before the shell sees the string; inline expansion allows shell metacharacter injection. All inputs must be passed through env vars. Verify in code review: no `${{ inputs.* }}` appears directly in `run:` bodies.

6. **`set -x` credential leak** — any composite step using `set -x` prints credentials to the debug log before masking is registered. Never use `set -x` in credential-adjacent steps; use `set +x` as a belt-and-suspenders guard.

---

## Implications for Roadmap

Based on combined research, the recommended three-phase build order follows the runtime dependency chain.

### Phase 1: Action 1 — OCI Token Exchange

**Rationale:** Action 1 is the entire critical path. No OCI CLI command, no Action 2 integration test, and no consuming workflow in `colour-within-ops` can succeed until a valid UPST is being produced. It carries all the implementation complexity. Build and validate this first in isolation.

**Delivers:**
- `actions/oci-token-exchange/action.yml` — composite entrypoint; passes inputs as env vars to `exchange.py`
- `actions/oci-token-exchange/exchange.py` — OIDC mint, RSA keygen via `TokenExchangeSigner`, HTTP POST with backoff, config/key write, secret masking, output emission
- `actions/oci-token-exchange/requirements.txt` — `oci>=2.173.1,<3`
- `actions/oci-token-exchange/README.md` — inputs/outputs table, permission requirements, audience/region defaults, SHA-pin pattern, 60-min UPST ceiling note, self-hosted runner cleanup warning

**Addresses:** All P1 features on the Action 1 side — OIDC mint, token exchange, masking, config write, `config-path`/`expires-at` outputs, `OCI_CLI_AUTH` env var.

**Avoids:**
- Strip UPST before `setSecret` — toolkit#1421 multiline masking
- Use literal `urn:oci:token-type:oci-upst` not the shorter PRD form
- Use audience `https://github.com/ColourWithin` not the Oracle SDK placeholder `"github-actions"`
- Register `client-secret` as first operation before any subprocess
- No `set -x` in any credential-adjacent step
- No `setup-python` inside the composite — use runner's Python 3.12.3 directly

**Research flags:** None — Oracle's first-party reference example is the implementation guide; HTTP request shape fully specified in canonical OCI docs.

### Phase 2: Action 2 — OCI CLI Command Wrapper

**Rationale:** Action 2 is ~30 lines of bash YAML. Can be written in parallel with Phase 1 at the code level but cannot be meaningfully integration-tested before Action 1 is functional. Low-risk, fast to complete.

**Delivers:**
- `actions/run-oci-cli-command/action.yml` — composite, bash-only; CLI guard, working-directory cd, bash -e -o pipefail execution, stdout capture, exit-code output
- `actions/run-oci-cli-command/README.md` — inputs/outputs table, prerequisite note about `oci` on PATH, `silent` usage guidance, chained-after-Action-1 example

**Addresses:** All P1 features on the Action 2 side — `oci --version` guard, `command`/`silent`/`query`/`working-directory` inputs, `output`/`raw-output`/`exit-code` outputs, `bash -e -o pipefail`.

**Avoids:**
- Pass `command` through env var, not inline `${{ inputs.command }}` — script injection
- Do not install OCI CLI inside Action 2 — per-invocation overhead; coupling
- Do not capture stderr into `outputs.output` — let stderr flow to runner log
- Default `silent: false` — do not replicate the oracle-actions debugging opacity anti-pattern

**Research flags:** None — thin bash wrapper with standard GitHub Actions output patterns.

### Phase 3: Smoke Test, Branch Protection, and v1.0.0 Tag

**Rationale:** The smoke test is the merge gate and cannot become a required status check until both action files exist and OCI credentials have been populated by the `colour-within-ops` Phase 02 B Tofu runbook. The skeleton YAML can be written in Phase 1 or 2, but activation happens here.

**Delivers:**
- `workflows/test-actions.yml` — PR smoke test using `@${{ github.sha }}` self-reference, `paths:` filter limited to `actions/**`, permission-scoped OCI API call (not just `oci iam region list`) to catch `allowImpersonation: false`
- Branch protection rule: `test-actions.yml` job as required status check
- `v1.0.0` tag with SHA captured for consumer consumption in `colour-within-ops`

**Avoids:**
- Using `oci iam region list` alone as smoke test assertion — succeeds for any authenticated principal regardless of type; must add a permission-scoped call that would fail for a `user` principal
- Running the smoke test before `OCI_OIDC_CLIENT_IDENTIFIER` / `OCI_OIDC_CLIENT_SECRET` / `OCI_DOMAIN_BASE_URL` are populated — prerequisite on `colour-within-ops` Phase 02 B

**Research flags:** Coordinate with `colour-within-ops` Phase 02 B workstream for secret population timing and agreement on which permission-scoped OCI API call to use in the smoke test assertion.

### Phase Ordering Rationale

- Action 1 first: it is the exclusive critical path — zero other work is testable without a working UPST.
- Action 2 second: implementation is trivial but integration test requires Phase 1 complete and functional.
- Smoke test + tag third: requires both action files and OCI credentials in place; making it a required check before those prerequisites exist would block all PRs.
- The `colour-within-ops` Phase 02 B workstream runs in parallel with all three phases here. Phase 3 is the coordination point where both streams must be complete before the smoke test can pass.

### Research Flags

Phases needing deeper research during planning:
- **None identified** — all phases have high-confidence implementation patterns from official Oracle and GitHub sources.

Phases with standard patterns (skip research-phase):
- **Phase 1:** Oracle's first-party `TokenExchangeSigner` example is the implementation reference; HTTP request shape fully specified in canonical OCI docs.
- **Phase 2:** Standard GitHub composite action bash pattern; no novel patterns.
- **Phase 3:** Standard GitHub Actions smoke test and branch protection configuration.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions confirmed from PyPI and GitHub APIs directly; runner image pre-installed packages confirmed from official ubuntu-24.04 readme; setup-python caching bug confirmed from open issue tracker |
| Features | HIGH | Peer actions reviewed directly; OCI-specific behaviours verified against SDK source and OCI docs; principal type defect verified against ateam blog and OCI identity propagation trust docs |
| Architecture | HIGH | All structural decisions from PRD and verified GitHub Actions docs; composite action limitations confirmed from official tracker issues |
| Pitfalls | HIGH (critical/security), MEDIUM (TTL edge cases) | Multiline masking bug confirmed from toolkit#1421; `requested_token_type` literal confirmed from canonical OCI docs; 60-min TTL confirmed from oracle/oci-cli#998 |

**Overall confidence:** HIGH

### Gaps to Address

- **`requested_token_type` discrepancy between PRD and canonical OCI docs:** The PRD uses `urn:oci:token-type:upst` (shorter form); canonical OCI docs use `urn:oci:token-type:oci-upst` (with `oci-` infix). The Python source must use the canonical longer form. Treat the PRD value as a typo — do not propagate it into the implementation.

- **`workload` principal type assertion deferred to v1.1:** The smoke test's permission-scoped API call provides indirect validation, but explicit JWT decode + `principal.type` assertion would make the fix from `gtrevorrow` directly visible in logs. Flag for v1.1 if the indirect check proves insufficient in practice.

- **Smoke test permission-scoped call selection:** The specific OCI API call used to validate `principal.type = 'workload'` must be agreed with the `colour-within-ops` team — it must be a call the Service User's group policy permits for `workload` principals but that would fail for a `user` principal. Phase 02 B coordination item.

- **OCI CLI install ownership:** Action 2 installs OCI CLI via the sentinel-file pattern so it is independently usable without Action 1 as a prerequisite. Confirm this decision during Phase 2 implementation; the alternative (consumer installs CLI as a pre-step) pushes boilerplate onto consumers.

---

## Sources

### Primary (HIGH confidence)
- PyPI `oci` 2.173.1 — `requires_python`, `requires_dist`, wheel tags
- PyPI `oci-cli` 3.81.1 — `requires_python`, version
- GitHub API `actions/checkout` releases — v6.0.2, SHA `de0fac2e`
- GitHub API `actions/setup-python` releases — v6.2.0, SHA `a309ff8b`
- GitHub API `actions/cache` releases — v5.0.5, SHA `27d5ce7f`
- `actions/runner-images` Ubuntu2404-Readme.md — Python 3.12.3 pre-installed; OCI CLI absent
- `actions/setup-python` issue #377 — pip cache broken inside composite actions (open, unresolved)
- `actions/toolkit` issue #1421 — `setSecret` silently fails on multiline strings
- OCI JWT-to-UPST token exchange docs — canonical request parameters including `urn:oci:token-type:oci-upst`
- OCI JWT-to-UPST release note — introduction of `urn:oci:token-type:oci-upst` with `oci-` infix
- Oracle Python SDK `workload_identity_federation_signer_example.py` — first-party GitHub Actions reference (including `"github-actions"` audience placeholder)
- `oracle-actions/run-oci-cli-command` source — sentinel-file install pattern, output masking behaviour
- GitHub composite action `post:` limitation — community discussion #26743
- GitHub `if: failure()` in composite actions — runner issue #1271 (not supported)
- OCI CLI issue #998 — session token not refreshed during long operations (60-min ceiling)
- GitHub Actions script injection docs — `${{ inputs.x }}` vs env var injection risk
- GitHub Actions OIDC reference — `permissions: { id-token: write }` requirements
- PRD-composite-actions.md (2026-05-09) — primary specification

### Secondary (MEDIUM confidence)
- Oracle ateam blog — `allowImpersonation` and `principal.type` explanation (loads in browser; 403 to curl; content referenced from OCI docs)
- OCI CLI environment variables docs — `OCI_CLI_AUTH` precedence

---

*Research completed: 2026-05-09*
*Ready for roadmap: yes*
