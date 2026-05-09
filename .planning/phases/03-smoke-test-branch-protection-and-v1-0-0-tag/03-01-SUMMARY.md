---
phase: 03-smoke-test-branch-protection-and-v1-0-0-tag
plan: 01
subsystem: ci
tags: [github-actions, actionlint, oci, release-readiness]
requires:
  - phase: 01-oci-token-exchange-action
    provides: actions/oci-token-exchange implementation and tests
  - phase: 02-oci-cli-wrapper-action
    provides: actions/run-oci-cli-command implementation and tests
provides:
  - Truthful local release-readiness workflow for .github
  - Corrected Phase 3 smoke requirements and roadmap contract
  - SHA-pinned actions/cache and checksum-verified actionlint install
affects: [phase-03, branch-protection, release-gate]
tech-stack:
  added: []
  patterns: [sha-pinned third-party workflow actions, checksum-verified tool downloads, local-only release-readiness checks]
key-files:
  created: []
  modified:
    - .github/workflows/test-actions.yml
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
key-decisions:
  - "Real OCI smoke remains external to colour-within-ops; local .github checks do not pretend to prove the IPT path."
  - "Third-party workflow actions are pinned to full commit SHAs and actionlint downloads are checksum-verified."
patterns-established:
  - "Local branch protection should require release-readiness checks only; external smoke evidence is a pre-tag gate."
requirements-completed: [SMOKE-01, SMOKE-06, SMOKE-07, REL-03]
duration: 10 min
completed: 2026-05-09
---

# Phase 03 Plan 01: Local Release-Readiness Summary

**Local `.github` release-readiness workflow with SHA-pinned third-party actions, actionlint checksum verification, and corrected external-smoke requirements**

## Performance

- **Duration:** 10 min
- **Started:** 2026-05-09T14:22:00Z
- **Completed:** 2026-05-09T14:32:28Z
- **Tasks:** 4
- **Files modified:** 3

## Accomplishments

- Corrected Phase 3 requirements and roadmap text so real OCI IPT smoke is owned by `colour-within-ops`, while this repo owns local release-readiness gates.
- Extended `.github/workflows/test-actions.yml` path triggers to include `docs/actions/**` and `README.md`.
- Added SHA-pinned `actions/cache@27d5ce7f107fe9357f9df03efb73ab90386fccae` with pip cache keys covering both `requirements.txt` and `pyproject.toml`.
- Replaced unverified actionlint extraction with a pinned v1.7.12 tarball SHA256 check.
- Added static checks for full-SHA workflow `uses:` refs and for preventing local real OCI smoke in this repo.

## Task Commits

1. **Task 1: Re-check current dependency versions before workflow edits** - no file change; observed versions recorded below
2. **Task 2: Correct Phase 3 requirements and roadmap for external smoke ownership** - `484f87e`
3. **Task 3: Harden local release-readiness workflow pins, cache, and static checks** - `484f87e`
4. **Task 4: Run local release-readiness verification** - no file change; verification passed

**Plan metadata:** pending orchestrator metadata commit

## Observed Dependency Versions

- `actions/cache`: v5.0.5, SHA `27d5ce7f107fe9357f9df03efb73ab90386fccae`
- `actions/checkout`: v6.0.2, SHA `de0fac2e4500dabe0009e67214ff5f5447ce83dd`
- `rhysd/actionlint`: v1.7.12, SHA `914e7df21a07ef503a81201c76d2b11c789d3fca`
- `oci-cli`: 3.81.1, stable release
- `oci`: 2.173.1, stable release
- `actionlint_1.7.12_linux_amd64.tar.gz` SHA256: `8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8`

## Files Created/Modified

- `.github/workflows/test-actions.yml` - Local release-readiness workflow with path filters, pip cache, checksum-verified actionlint install, and static supply-chain/auth-boundary checks.
- `.planning/REQUIREMENTS.md` - Smoke requirements corrected for external `colour-within-ops` ownership.
- `.planning/ROADMAP.md` - Phase 3 goal, dependency, success criteria, and plan list corrected for local checks plus external smoke evidence.

## Decisions Made

- No local `.github` job will run the real OCI token exchange path because the IPT is pinned to `colour-within-ops`.
- Branch protection should require local release-readiness checks only; external smoke is recorded before the tag.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Local Python install command hit PEP 668**
- **Found during:** Task 4 (Run local release-readiness verification)
- **Issue:** This machine's `python -m pip install ...` is uv-managed and refused global installation with `externally-managed-environment`.
- **Fix:** Re-ran verification in `/tmp/cw-dot-github-phase3-venv`, outside the repo, using the same dependency set.
- **Files modified:** None
- **Verification:** Full local verification passed in the temporary venv.
- **Committed in:** no code commit; environment-only verification adjustment

**2. [Rule 3 - Blocking] Static no-local-smoke lint matched itself**
- **Found during:** Task 3 acceptance verification
- **Issue:** The guardrail contained `OCI_OIDC_CLIENT_IDENTIFIER` literally inside its own shell script, so it would always fail.
- **Fix:** Rewrote the check to construct sentinel strings inside Python, avoiding self-match while preserving the regression guard.
- **Files modified:** `.github/workflows/test-actions.yml`
- **Verification:** The lint and `actionlint` both pass.
- **Committed in:** `484f87e`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes preserved the intended contract and prevented false local failures. No scope expansion.

## Issues Encountered

None remaining.

## Verification

- `ruff check actions/oci-token-exchange/` passed.
- `pytest actions/oci-token-exchange/tests/ -v` passed: 19 tests.
- `actionlint .github/workflows/test-actions.yml` passed.
- `cd actions/run-oci-cli-command && npm test -- --run` passed: 25 tests.
- `cd actions/run-oci-cli-command && npm run typecheck` passed.
- `cd actions/run-oci-cli-command && npm audit --audit-level=high` passed.
- `cd actions/run-oci-cli-command && npm run licenses` passed.
- `cd actions/run-oci-cli-command && npm run build` passed.
- `git diff --exit-code -- actions/run-oci-cli-command/dist/index.js` passed.

## User Setup Required

None - no external service configuration required by this local plan.

## Next Phase Readiness

Local release-readiness is ready for Plan 03-03 branch-protection verification. External OCI smoke remains owned by the `colour-within-ops` handoff from Plan 03-02.

---
*Phase: 03-smoke-test-branch-protection-and-v1-0-0-tag*
*Completed: 2026-05-09*
