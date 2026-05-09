---
phase: 2
slug: oci-cli-wrapper-action
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-09
nyquist_rationale: |
  Phase 2 has one implementation plan with explicit test-first tasks. The first
  task creates the TypeScript package, Vitest infrastructure, and failing tests
  for command parsing, install/version behavior, output semantics, and failure
  behavior before runtime implementation lands. Subsequent tasks run the quick
  Vitest suite after every code change and the full npm/CI/artifact freshness
  suite at the end. Real OCI smoke testing is intentionally deferred to Phase 3.
---

# Phase 2 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 |
| **Config file** | `actions/run-oci-cli-command/package.json`, `actions/run-oci-cli-command/tsconfig.json` |
| **Quick run command** | `cd actions/run-oci-cli-command && npm test -- --run` |
| **Full suite command** | `cd actions/run-oci-cli-command && npm ci && npm test -- --run && npm run typecheck && npm audit --audit-level=high && npm run licenses && npm run build && git diff --exit-code -- dist/index.js` |
| **Estimated runtime** | ~30 seconds locally after npm cache warm; no real OCI calls |

---

## Sampling Rate

- **After every task commit:** Run `cd actions/run-oci-cli-command && npm test -- --run`
- **After every plan wave:** Run the full suite command above
- **Before `$gsd-verify-work`:** Full suite, Phase 1 Python gates, actionlint, and generated dist freshness must be green
- **Max feedback latency:** 30 seconds for action-local tests; generated bundle freshness checked before phase closeout

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | CLIRUN-01, CLIRUN-02 | T-2-01 | Parser requires leading `oci`, rejects shell operators/non-string tokens, and never executes through shell interpolation | unit + static | `cd actions/run-oci-cli-command && npm test -- --run command` | W0 | pending |
| 2-01-02 | 01 | 1 | CLIRUN-03, CLIRUN-04 | T-2-02 | Missing/old OCI CLI triggers `python -m pip install --user 'oci-cli>=3.81.1'`; current CLI skips reinstall via version-aware sentinel | unit | `cd actions/run-oci-cli-command && npm test -- --run install` | W0 | pending |
| 2-01-03 | 01 | 1 | CLIRUN-05, CLIRUN-06 | T-2-03 | stdout/stderr stream live; `output`, `raw-output`, `exit-code`, and `oci-cli-version` are written before failure | unit + integration fake | `cd actions/run-oci-cli-command && npm test -- --run index` | W0 | pending |
| 2-01-04 | 01 | 1 | CLIRUN-07, CLIRUN-08 | T-2-04 | Docs and planning requirements describe the TypeScript action contract and no stale bash-only wording remains | static | `rg "bash-only|composite \\+ bash only|total ~30 lines" .planning/PROJECT.md .planning/REQUIREMENTS.md actions/run-oci-cli-command/README.md docs/actions || true` | n/a | pending |
| 2-01-05 | 01 | 1 | CLIRUN-01..08 | T-2-05 | npm dependency, audit, license, build, and committed `dist/index.js` freshness gates all pass | CI | `cd actions/run-oci-cli-command && npm ci && npm test -- --run && npm run typecheck && npm audit --audit-level=high && npm run licenses && npm run build && git diff --exit-code -- dist/index.js` | W0 | pending |

*Status: pending, green, red, flaky*

---

## Wave 0 Requirements

- [ ] `actions/run-oci-cli-command/package.json` - scripts for `test`, `typecheck`, `build`, and `licenses`
- [ ] `actions/run-oci-cli-command/package-lock.json` - exact npm dependency contract
- [ ] `actions/run-oci-cli-command/tsconfig.json` - strict TypeScript compile target for Node action runtime
- [ ] `actions/run-oci-cli-command/tests/command.test.ts` - parser and query tests
- [ ] `actions/run-oci-cli-command/tests/install.test.ts` - fake PATH/Python/pip/sentinel tests
- [ ] `actions/run-oci-cli-command/tests/index.test.ts` - fake OCI execution and output/failure tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| README clarity and examples | CLIRUN-07 | Docs quality requires human reading | Confirm README covers safe JSON quoting, `--query` conflict behavior, install behavior, `silent`, outputs, non-zero failure, and relationship to `actions/oci-token-exchange` |
| Real OCI command after UPST exchange | Phase 3 success criteria | Requires real OCI secrets and tenancy state | Deferred to Phase 3 smoke workflow after required secrets/vars exist |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s for local action tests
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-09
