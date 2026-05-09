# Roadmap: ColourWithin/.github — OCI Composite Actions v1.0

## Overview

Three phases deliver first-party GitHub actions that replace unmaintained third-party alternatives shipping CVEs and wrong principal types. Phase 1 builds the OCI token exchange composite action — the entire critical path for OCI authentication. Phase 2 builds the TypeScript JavaScript OCI CLI wrapper action (can be developed in parallel with Phase 1, but integration tests are blocked until Phase 1 is functional). Phase 3 hardens the local `.github` release-readiness workflow, documents the real OCI smoke in `colour-within-ops`, applies branch protection for local checks only, records external smoke evidence, and tags v1.0.0 after both gates pass.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: OCI Token Exchange Action** - Build `actions/oci-token-exchange`: composite + Python action that mints a GitHub OIDC ID token, exchanges it for an OCI UPST via Identity Propagation Trust, writes OCI CLI config to disk, masks secrets, and emits outputs
- [x] **Phase 2: OCI CLI Wrapper Action** - Build `actions/run-oci-cli-command`: TypeScript JavaScript action that installs/upgrades OCI CLI, parses `oci ...` commands into argv, executes without a shell, and captures output/exit-code diagnostics
- [ ] **Phase 3: Smoke Test, Branch Protection, and v1.0.0 Tag** - Require truthful local release-readiness checks in `.github`, hand off real OCI IPT smoke to `colour-within-ops`, apply branch protection for local checks only, and tag v1.0.0 after external smoke evidence is recorded

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
- [x] 01-01: Implement `exchange.py` — OIDC token mint, RSA keygen, token exchange POST with retry, config write, secret masking, output emission
- [x] 01-02: Wire `action.yml` composite entrypoint — inputs/outputs declaration, env-var passing to `exchange.py`, `requirements.txt`, action README

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
- [x] 02-01: Implement TypeScript OCI CLI wrapper action — package, parser, install/version sentinel, argv execution, outputs, docs, Dependabot, npm CI gates, committed ncc bundle

### Phase 3: Smoke Test, Branch Protection, and v1.0.0 Tag
**Goal**: Local release-readiness checks protect PRs in `.github`, real OCI IPT smoke runs manually in `colour-within-ops` against the candidate `.github` SHA, branch protection requires local checks only, and `v1.0.0` is tagged for SHA-pinned consumer consumption after external smoke evidence passes
**Depends on**: Phase 1 and Phase 2 both complete
**External dependency (BLOCKER)**: This phase cannot prove the real OCI trust path inside the `.github` repo because the Identity Propagation Trust is pinned to `colour-within-ops`. The external smoke must live in `colour-within-ops/.github/workflows/oci-ipt-smoke.yml`, run with `environment: production`, request `id-token: write` and `contents: read`, use audience `https://github.com/ColourWithin/colour-within-ops`, call the candidate `.github` action SHA, and run the read-only command `oci os ns get` unless a documented permission-scoped fallback is needed.
**Requirements**: SMOKE-01, SMOKE-02, SMOKE-03, SMOKE-04, SMOKE-05, SMOKE-06, SMOKE-07, REL-01, REL-02, REL-03, REL-04
**Success Criteria** (what must be TRUE):
  1. Opening a PR that modifies files under `actions/**`, `docs/actions/**`, `README.md`, or `.github/workflows/test-actions.yml` triggers `.github/workflows/test-actions.yml` and runs local release-readiness gates for both actions.
  2. External smoke evidence from `colour-within-ops/.github/workflows/oci-ipt-smoke.yml` records the candidate `.github` SHA, workflow run URL, `oci os ns get` command, exit code 0, JSON parse result, and `oci-cli-version >= 3.81.1`.
  3. The required branch-protection status check on `main` is local release-readiness only; the external smoke remains a manual pre-tag evidence gate and is not required by `.github` branch protection.
  4. `v1.0.0` is signed and tagged on the exact `origin/main` SHA that `colour-within-ops` smoke-tested, and the top-level README documents the SHA-pinned consumption pattern with the doubled `.github` path explanation.

Plans:
- [x] 03-01: Correct requirements/roadmap and harden local release-readiness workflow — paths filter, SHA-pinned `actions/cache`, checksum-verified actionlint install, static checks, and local Python/npm gates
- [x] 03-02: Document external `colour-within-ops` OCI IPT smoke handoff — workflow skeleton, evidence checklist, action README links, and non-goals
- [x] 03-03: Prepare v1.0.0 release-candidate gate — README release note, candidate-SHA choreography, external smoke evidence template, and local branch-protection verification
- [ ] 03-04: Manual signed `v1.0.0` tag — after merge to main and passed external smoke evidence for the exact `origin/main` SHA

## Progress

**Execution Order:**
Phases 1 and 2 can be developed concurrently (code); Phase 2 integration testing requires Phase 1 complete; Phase 3 requires both complete plus out-of-band secret population from `colour-within-ops` Phase 02 B.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. OCI Token Exchange Action | 2/2 | Complete | 2026-05-09 |
| 2. OCI CLI Wrapper Action | 1/1 | Complete | 2026-05-09 |
| 3. Smoke Test, Branch Protection, and v1.0.0 Tag | 0/4 | In Progress | - |
