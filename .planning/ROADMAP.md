# Roadmap: ColourWithin/.github — OCI Composite Actions v1.0

## Overview

Three phases deliver first-party GitHub actions that replace unmaintained third-party alternatives shipping CVEs and wrong principal types. Phase 1 builds the OCI token exchange composite action — the entire critical path for OCI authentication. Phase 2 builds the TypeScript JavaScript OCI CLI wrapper action (can be developed in parallel with Phase 1, but integration tests are blocked until Phase 1 is functional). Phase 3 activates the smoke test as a required merge gate, applies branch protection, and tags v1.0.0. Phase 3 has an external coordination dependency on `colour-within-ops` Phase 02 B populating repo secrets before the smoke test can pass.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: OCI Token Exchange Action** - Build `actions/oci-token-exchange`: composite + Python action that mints a GitHub OIDC ID token, exchanges it for an OCI UPST via Identity Propagation Trust, writes OCI CLI config to disk, masks secrets, and emits outputs
- [ ] **Phase 2: OCI CLI Wrapper Action** - Build `actions/run-oci-cli-command`: TypeScript JavaScript action that installs/upgrades OCI CLI, parses `oci ...` commands into argv, executes without a shell, and captures output/exit-code diagnostics
- [ ] **Phase 3: Smoke Test, Branch Protection, and v1.0.0 Tag** - Activate `workflows/test-actions.yml` as a required PR status check using permission-scoped OCI API assertion, apply branch protection, and tag v1.0.0

## Phase Details

### Phase 1: OCI Token Exchange Action
**Goal**: A consumer workflow can call `actions/oci-token-exchange` and receive a valid OCI UPST on disk with OCI CLI config ready for subsequent steps
**Depends on**: Nothing (first phase)
**Parallel note**: Phase 2 code can be written concurrently; Phase 2 integration testing is blocked until this phase is functional
**Requirements**: TOKEX-01, TOKEX-02, TOKEX-03, TOKEX-04, TOKEX-05, TOKEX-06, TOKEX-07, TOKEX-08, TOKEX-09, TOKEX-10, TOKEX-11, TOKEX-12, TOKEX-13, TOKEX-14
**Success Criteria** (what must be TRUE):
  1. A workflow step calling `actions/oci-token-exchange` with valid `client-identifier`, `client-secret`, and `domain-base-url` inputs produces a UPST written to `~/.oci/upst.pem` and an OCI CLI config at `~/.oci/config` without printing the UPST value in plain text in the job log
  2. A workflow step missing `permissions: { id-token: write }` fails immediately with a message that names the exact YAML permission block required — it does not hang or produce a cryptic error
  3. A token exchange request that receives a 4xx response from the OCI token endpoint surfaces the OCI `error` and `error_description` fields verbatim and does not retry
  4. `OCI_CLI_AUTH=security_token` is visible as an environment variable to all subsequent steps in the same job without the consumer explicitly setting it
  5. The action exposes `config-path` (absolute path to written config) and `expires-at` (ISO 8601 expiry) as step outputs
**Plans**: TBD

Plans:
- [ ] 01-01: Implement `exchange.py` — OIDC token mint, RSA keygen, token exchange POST with retry, config write, secret masking, output emission
- [ ] 01-02: Wire `action.yml` composite entrypoint — inputs/outputs declaration, env-var passing to `exchange.py`, `requirements.txt`, action README

### Phase 2: OCI CLI Wrapper Action
**Goal**: A consumer workflow can call `actions/run-oci-cli-command` after `actions/oci-token-exchange` and receive the OCI CLI command's stdout and exit code as step outputs
**Depends on**: Phase 1 (for integration testing; code can be written in parallel)
**Parallel note**: Implementation can proceed concurrently with Phase 1; smoke-testing this action requires Phase 1 to be functional first
**Requirements**: CLIRUN-01, CLIRUN-02, CLIRUN-03, CLIRUN-04, CLIRUN-05, CLIRUN-06, CLIRUN-07, CLIRUN-08
**Success Criteria** (what must be TRUE):
  1. A workflow step calling `actions/run-oci-cli-command` with `command: oci iam region list` after a successful token exchange step exits 0 and makes the command's stdout available as `outputs.output` (trimmed) and `outputs.raw-output`
  2. A workflow step calling `actions/run-oci-cli-command` when the `oci` CLI is not installed fails immediately with a message identifying the missing binary — it does not produce a shell `command not found` error without context
  3. Multiple `actions/run-oci-cli-command` steps in a single job do not each reinstall OCI CLI — the sentinel file (`~/.oci-cli-installed`) prevents repeated installs
  4. The `command` input is never interpolated directly into a shell `run:` body — it is passed via an environment variable, preventing script injection
**Plans**: TBD

Plans:
- [ ] 02-01: Implement TypeScript OCI CLI wrapper action — package, parser, install/version sentinel, argv execution, outputs, docs, Dependabot, npm CI gates, committed ncc bundle

### Phase 3: Smoke Test, Branch Protection, and v1.0.0 Tag
**Goal**: Both actions are verified end-to-end against real OCI on every PR that touches action files, merging to main is blocked without a passing smoke test, and `v1.0.0` is tagged for SHA-pinned consumer consumption
**Depends on**: Phase 1 and Phase 2 both complete
**External dependency (BLOCKER)**: This phase cannot produce a passing smoke test until `colour-within-ops` Phase 02 B populates `OCI_OIDC_CLIENT_IDENTIFIER`, `OCI_OIDC_CLIENT_SECRET`, and `OCI_DOMAIN_BASE_URL` in this repo's GitHub Secrets/Variables. That is a separate workstream requiring out-of-band coordination. The workflow YAML can be written and merged ahead of secret population, but the required status check must not be activated until secrets are present or all PRs will be blocked by a permanently failing check.
**Requirements**: SMOKE-01, SMOKE-02, SMOKE-03, SMOKE-04, SMOKE-05, SMOKE-06, SMOKE-07, REL-01, REL-02, REL-03, REL-04
**Success Criteria** (what must be TRUE):
  1. Opening a PR that modifies any file under `actions/**` triggers `workflows/test-actions.yml` using `@${{ github.sha }}` self-reference — the PR's own action code is what runs, not a previously tagged version
  2. The smoke test calls a permission-scoped OCI API (not merely `oci iam region list` which succeeds for any authenticated principal) — a UPST produced with `allowImpersonation: true` passes where one produced with a misconfigured IPT would fail
  3. The smoke test is a required status check on the main branch — a PR that breaks either action cannot be merged
  4. `v1.0.0` is tagged on the repo and the top-level README documents the SHA-pinned consumption pattern with the doubled `.github` path explanation
**Plans**: TBD

Plans:
- [ ] 03-01: Write `workflows/test-actions.yml` — `paths:` filter, `@${{ github.sha }}` self-reference, `actions/cache` pip caching, permission-scoped OCI API assertion, SHA-pinned third-party action references
- [ ] 03-02: Activate branch protection (required status check), tag `v1.0.0`, update top-level README with SHA-pin consumption docs and changelog entry

## Progress

**Execution Order:**
Phases 1 and 2 can be developed concurrently (code); Phase 2 integration testing requires Phase 1 complete; Phase 3 requires both complete plus out-of-band secret population from `colour-within-ops` Phase 02 B.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. OCI Token Exchange Action | 0/2 | Not started | - |
| 2. OCI CLI Wrapper Action | 0/1 | Not started | - |
| 3. Smoke Test, Branch Protection, and v1.0.0 Tag | 0/2 | Not started | - |
