---
phase: 3
slug: smoke-test-branch-protection-and-v1-0-0-tag
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-09
nyquist_rationale: |
  Phase 3 has two validation layers: local deterministic checks in the `.github`
  repo, and manual external OCI smoke evidence from `colour-within-ops`. The
  local layer is fully automatable with existing Python/npm/actionlint/static
  checks. The real OCI layer is intentionally manual because branch protection
  in this repo cannot require a workflow run from another repo without a
  reporting bridge, which v1.0 explicitly defers.
---

# Phase 3 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest, ruff, actionlint, Vitest, npm audit/license/build checks, GitHub CLI for release/branch checks |
| **Config file** | `.github/workflows/test-actions.yml`, `actions/oci-token-exchange/pyproject.toml`, `actions/run-oci-cli-command/package.json` |
| **Quick run command** | `ruff check actions/oci-token-exchange/ && pytest actions/oci-token-exchange/tests/ -q && cd actions/run-oci-cli-command && npm test -- --run` |
| **Full suite command** | `python -m pip install 'oci>=2.173.1,<3' requests cryptography pytest ruff && ruff check actions/oci-token-exchange/ && pytest actions/oci-token-exchange/tests/ -v && cd actions/run-oci-cli-command && npm ci && npm test -- --run && npm run typecheck && npm audit --audit-level=high && npm run licenses && npm run build && git diff --exit-code -- dist/index.js` |
| **Estimated runtime** | ~60 seconds locally after caches warm; external OCI smoke is manual |

---

## Sampling Rate

- **After every task commit:** Run quick local checks relevant to touched files.
- **After every plan wave:** Run the full local suite and static workflow checks.
- **Before `$gsd-verify-work`:** Full local suite must be green and external `colour-within-ops` smoke evidence must be recorded.
- **Max feedback latency:** 60 seconds for local checks; external smoke is a release checkpoint.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | SMOKE-01, SMOKE-06, REL-03 | T-3-01, T-3-02 | Local workflow keeps existing gates, adds pip cache with SHA-pinned action, and verifies actionlint checksum before extraction | static + CI | `actionlint .github/workflows/test-actions.yml` plus grep checks for SHA pins and checksum verification | yes | pending |
| 3-01-02 | 01 | 1 | SMOKE-02..07 | T-3-03 | Requirements/roadmap no longer claim false local OCI self-smoke; they point to external ops smoke evidence | static | `rg "colour-within-ops\|external smoke\|oci-ipt-smoke" .planning/REQUIREMENTS.md .planning/ROADMAP.md` | yes | pending |
| 3-02-01 | 02 | 1 | SMOKE-02..05 | T-3-04 | External smoke handoff uses production environment, id-token permission, ops audience, candidate SHA refs, and read-only `oci os ns get` | docs/static | `rg "oci-ipt-smoke\|workflow_dispatch\|https://github.com/ColourWithin/colour-within-ops\|oci os ns get" docs/actions` | yes | pending |
| 3-03-01 | 03 | 2 | SMOKE-07, REL-01, REL-02, REL-04 | T-3-05 | Tagging is blocked until local checks and external smoke evidence for candidate SHA are verified | manual + CLI | `gh api repos/ColourWithin/.github/branches/main/protection` and `git rev-parse v1.0.0` after approval | yes | pending |

*Status: pending, green, red, flaky*

---

## Wave 0 Requirements

- Existing Python tests and npm tests already exist from Phases 1 and 2.
- Existing `.github/workflows/test-actions.yml` already provides local CI foundation.
- Existing action docs exist under `docs/actions/`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real OCI smoke against trusted IPT subject | SMOKE-02, SMOKE-03, SMOKE-04, SMOKE-05 | The trusted OIDC subject is `colour-within-ops`, not this `.github` repo | Run `colour-within-ops/.github/workflows/oci-ipt-smoke.yml` with the candidate `.github` SHA and record run URL/result |
| Branch protection activation | SMOKE-07 | Requires repo administration permissions and should only require local checks | Verify required status checks via `gh api repos/ColourWithin/.github/branches/main/protection` |
| `v1.0.0` tag creation | REL-01 | Externally visible release marker requiring final human approval | After local checks and external smoke evidence, create signed tag or approved release tag command |

---

## Validation Sign-Off

- [x] All tasks have automated verify or manual evidence gates
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s for local checks
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-09
