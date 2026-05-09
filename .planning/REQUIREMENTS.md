# Requirements: ColourWithin/.github — Composite Actions

**Defined:** 2026-05-09
**Core Value:** ColourWithin workflows authenticate to OCI as a properly-classified Service User via short-lived UPSTs — replacing unmaintained third-party actions that ship CVEs and use the wrong principal type — without depending on stale upstreams.

## v1 Requirements

### Token Exchange Action (`actions/oci-token-exchange`)

- [ ] **TOKEX-01**: Action accepts `client-identifier`, `client-secret`, `domain-base-url` as required inputs (sourced from secrets/vars) and `audience` (default `https://github.com/ColourWithin`), `region` (default `ap-sydney-1`), `output-config-path` (default `${HOME}/.oci/config`), `output-key-path` (default `${HOME}/.oci/upst.pem`) as optional inputs
- [ ] **TOKEX-02**: Action mints a GitHub OIDC ID token for the configured `audience` using `ACTIONS_ID_TOKEN_REQUEST_URL` / `ACTIONS_ID_TOKEN_REQUEST_TOKEN` env vars from Python (no Node, no `@actions/core`)
- [ ] **TOKEX-03**: Action generates an ephemeral RSA-2048 keypair on each invocation; private key is written to `output-key-path` with `chmod 600`
- [ ] **TOKEX-04**: Action POSTs to `${domain-base-url}/oauth2/v1/token` with `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`, `requested_token_type=urn:oci:token-type:oci-upst` (canonical OCI literal — note PRD typo correction), `subject_token=<jwt>`, `subject_token_type=jwt`, `public_key=<base64-DER-spki>`, HTTP Basic auth using client-id/secret
- [ ] **TOKEX-05**: Action persists the returned UPST + ephemeral private key to disk in OCI CLI config format (`security_token_file`, `key_file`, `region`) at `output-config-path`
- [ ] **TOKEX-06**: Action exports `OCI_CLI_AUTH=security_token` to `$GITHUB_ENV` so subsequent steps in the job authenticate via security token automatically
- [ ] **TOKEX-07**: Action emits `config-path` and `expires-at` (ISO 8601) outputs
- [ ] **TOKEX-08**: Action registers the UPST and `client-secret` with `core.setSecret` (via `::add-mask::` workflow command) AFTER stripping any trailing newline (toolkit issue #1421 — multiline secrets silently no-op)
- [ ] **TOKEX-09**: Action fails fast with a clear, actionable message naming the exact `permissions: { id-token: write, contents: read }` YAML fix when `ACTIONS_ID_TOKEN_REQUEST_URL` is unset
- [ ] **TOKEX-10**: Action surfaces OCI `error` and `error_description` fields verbatim on 4xx token-endpoint responses; does NOT retry on 4xx
- [ ] **TOKEX-11**: Action retries on 5xx / transient network failures with exponential backoff, max 3 attempts, max ~10s total elapsed
- [ ] **TOKEX-12**: Action installs `oci>=2.173.1,<3` via `pip install --user` using the runner's pre-installed Python 3.12.3 (no `actions/setup-python` step inside the action — known caching incompatibility with composite actions, issue #377)
- [ ] **TOKEX-13**: Action ships a README documenting required consumer permissions, IPT prerequisites, audience-mapping guidance, and the chosen implementation option (Option A — composite + Python) with rationale
- [ ] **TOKEX-14**: Action does NOT echo any input value via `set -x` or implicit shell tracing; bash steps run with `bash -e -o pipefail` only

### CLI Wrapper Action (`actions/run-oci-cli-command`)

- [ ] **CLIRUN-01**: Action accepts `command` (required, must include leading `oci` literal), `silent` (default `false` — explicitly NOT the upstream's `true`, which causes operator confusion), `query` (optional, passed verbatim as `--query <value>`), `working-directory` (default `${{ github.workspace }}`)
- [ ] **CLIRUN-02**: Action passes `command` through an env var, never inline `${{ inputs.command }}` interpolation in a `run:` body (script-injection prevention)
- [ ] **CLIRUN-03**: Action installs `oci-cli>=3.81.1` via `pip install --user` guarded by a sentinel file (`~/.oci-cli-installed`) so multiple invocations within a single job don't reinstall
- [ ] **CLIRUN-04**: Action verifies `oci --version` succeeds before running the command; fails with a clear message pointing at the install requirement otherwise
- [ ] **CLIRUN-05**: Action runs the command with `bash -e -o pipefail`, captures stdout to `outputs.output` (trimmed) and `outputs.raw-output` (untrimmed), captures exit code to `outputs.exit-code` as a string
- [ ] **CLIRUN-06**: Action fails the step on non-zero exit code (no automatic interpretation of OCI errors, no retry)
- [ ] **CLIRUN-07**: Action ships a README documenting input/output contract, dependency on `actions/oci-token-exchange` (or any pre-existing `~/.oci/config`), and the consumer pattern
- [ ] **CLIRUN-08**: Action implementation is composite + bash only (no Node, no Python toolchain inside the action.yml) — total ~30 lines of YAML

### Smoke Test Workflow (`workflows/test-actions.yml`)

- [ ] **SMOKE-01**: Workflow triggers on PR-to-main when files under `actions/**` or `.github/workflows/test-actions.yml` change
- [ ] **SMOKE-02**: Workflow declares `permissions: { id-token: write, contents: read }`
- [ ] **SMOKE-03**: Workflow exercises `actions/oci-token-exchange@${{ github.sha }}` (self-reference to the PR's own code) using `OCI_OIDC_CLIENT_IDENTIFIER` / `OCI_OIDC_CLIENT_SECRET` / `OCI_DOMAIN_BASE_URL` from this repo's secrets/variables
- [ ] **SMOKE-04**: Workflow exercises `actions/run-oci-cli-command@${{ github.sha }}` chained off the token-exchange step
- [ ] **SMOKE-05**: Workflow asserts a permission-scoped OCI call succeeds (e.g. `oci iam compartment list --compartment-id <tenancy-ocid>` or similar policy-gated call) — NOT just `oci iam region list`, which any authenticated principal passes regardless of `principal.type`
- [ ] **SMOKE-06**: Workflow uses `actions/cache@v5.0.5` with `path: ~/.cache/pip` keyed on `hashFiles('actions/oci-token-exchange/requirements.txt')` to amortise SDK install across runs
- [ ] **SMOKE-07**: Smoke test is a required check on PR-to-main via branch protection rule

### Release & Consumption

- [ ] **REL-01**: Repository tagged `v1.0.0` after smoke tests pass and both action READMEs exist
- [ ] **REL-02**: Top-level `README.md` (or supplementary `actions/README.md`) documents the SHA-pinned consumption pattern, doubled-`.github` path explanation, and consumer prerequisites
- [ ] **REL-03**: All third-party action references (`actions/checkout`, `actions/cache`, etc.) in `workflows/test-actions.yml` are SHA-pinned, not tag-pinned
- [ ] **REL-04**: Consumer-facing changelog entry in repo `README.md` notes initial v1.0.0 surface area and known limitations (60-min UPST ceiling, OCI CLI session-token-refresh bug oracle/oci-cli#998)

## v2 Requirements

Deferred to v1.1 / v2.

### Token Exchange Hardening

- **TOKEX-V2-01**: Action asserts the returned UPST has `principal.type = 'workload'` by decoding the JWT and checking the claim — fails fast with an actionable message pointing at IPT `allowImpersonation: false` configuration if `'user'` is detected (the original defect that motivated this project)
- **TOKEX-V2-02**: Action supports `audience` validation — reads the audience claim from the minted GH OIDC token and warns if it does not match what the IPT expects

### Operator UX

- **CLIRUN-V2-01**: Optional `retry-on-rate-limit` flag for transparent retry on OCI rate-limit responses (HTTP 429 with `Retry-After`)
- **CLIRUN-V2-02**: Optional structured-error mode that parses and surfaces `error_description` JSON when the underlying `oci` CLI returns service errors

### Multi-Tenancy

- **MULTI-V2-01**: Action 1 supports a list of `audience` / `domain-base-url` pairs, mints multiple UPSTs, writes multi-profile OCI config

## Out of Scope

| Feature | Reason |
|---------|--------|
| OCIR login action | Consumer uses `docker/login-action@v3` directly with a Vault-fetched OCIR auth token |
| OCIR repo lookup / management action | Already managed by `colour-within-ops` Tofu IaC |
| OKE kubeconfig action | No OKE in any current ColourWithin project |
| Offline / mocked test mode for the actions | Value of the action is in OCI integration; mocked tests test the wrong thing |
| Building IPT, Service User, Group, Confidential Application, policies in OCI | `colour-within-ops/deploy/tofu/modules/identity/` owns this |
| Populating consumer-repo secrets | Tofu output → `gh secret set` runbook in `colour-within-ops` owns this |
| UPST refresh loop inside Action 2 | OCI CLI itself does not reload session tokens during execution (oracle/oci-cli#998); a refresh loop in the wrapper would create false safety. Document the 60-min ceiling instead |
| Post-job cleanup of credentials | Composite actions have no `post:` lifecycle hook (GHA limitation). Acceptable on GitHub-hosted ephemeral runners; documented as a self-hosted runner caveat |
| `id-token: write` permission injection | Permission declarations cannot live inside `action.yml`; consumers must declare. Action 1 fails fast with the YAML fix instead |
| `oracle-actions/run-oci-cli-command` default of `silent: true` | Causes operator confusion in practice; our default is `silent: false` and `core.setSecret` handles the redaction surgically |
| Bundled `dist/` directory | Anti-pattern from the upstream we replace; composite actions don't need it and it hides supply-chain risk |
| Pinning a specific patch of `oci` SDK | Pin a minimum (`>=2.173.1,<3`) to track Oracle's patch fixes without action-side churn |

## Traceability

Empty until roadmap creation populates phase mapping.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TOKEX-01 — TOKEX-14 | TBD | Pending |
| CLIRUN-01 — CLIRUN-08 | TBD | Pending |
| SMOKE-01 — SMOKE-07 | TBD | Pending |
| REL-01 — REL-04 | TBD | Pending |

**Coverage:**
- v1 requirements: 33 total (14 TOKEX + 8 CLIRUN + 7 SMOKE + 4 REL)
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 33 ⚠️

---
*Requirements defined: 2026-05-09*
*Last updated: 2026-05-09 after /gsd-new-project initial definition*
