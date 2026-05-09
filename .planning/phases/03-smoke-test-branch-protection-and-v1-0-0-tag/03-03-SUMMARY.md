---
phase: 03-smoke-test-branch-protection-and-v1-0-0-tag
plan: 03
subsystem: release
tags: [release-gate, branch-protection, rulesets, v1.0.0]
requires:
  - phase: 03-01
    provides: local release-readiness workflow and corrected smoke contract
  - phase: 03-02
    provides: external colour-within-ops OCI IPT smoke handoff
provides:
  - Minimal top-level action release-candidate README note
  - Candidate SHA release choreography
  - External smoke evidence template with organisation ruleset notes
affects: [phase-03, release-tag, branch-protection]
tech-stack:
  added: []
  patterns: [candidate-sha choreography, organisation ruleset verification, manual smoke evidence]
key-files:
  created:
    - .planning/phases/03-smoke-test-branch-protection-and-v1-0-0-tag/03-RELEASE-DANCE.md
    - .planning/phases/03-smoke-test-branch-protection-and-v1-0-0-tag/03-EXTERNAL-SMOKE-EVIDENCE.md
  modified:
    - README.md
key-decisions:
  - "Final tag creation is deferred to Plan 03-04 after merge to main and external smoke evidence."
  - "Main is protected by an active organisation ruleset rather than the legacy branch-protection endpoint."
patterns-established:
  - "Release evidence should record the exact candidate SHA, ops smoke URL, OCI command result, and ruleset protection evidence before tagging."
requirements-completed: [SMOKE-07, REL-02, REL-03, REL-04]
duration: 8 min
completed: 2026-05-09
---

# Phase 03 Plan 03: Release-Candidate Gate Summary

**Release-candidate gate with top-level action docs, candidate-SHA choreography, smoke evidence template, and organisation ruleset verification**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-09T14:32:28Z
- **Completed:** 2026-05-09T14:40:00Z
- **Tasks:** 4
- **Files modified:** 3

## Accomplishments

- Added a concise `README.md` section for first-party GitHub Actions and SHA-pinned consumption.
- Created `03-RELEASE-DANCE.md` as the single source of truth for merge, candidate SHA capture, ops smoke, evidence, and final tag choreography.
- Created `03-EXTERNAL-SMOKE-EVIDENCE.md` with pending smoke evidence fields and branch-protection/ruleset notes.
- Verified the live organisation ruleset `Protect default branch` (`id: 13867847`) is active for default branches.

## Task Commits

1. **Task 1: Add minimal top-level v1.0.0 action release note** - `1e31a05`
2. **Task 2: Create release choreography single-source-of-truth doc** - `1e31a05`
3. **Task 3: Create external colour-within-ops smoke evidence template** - `1e31a05`
4. **Task 4: Verify branch protection requires only local checks** - `1e31a05`

**Plan metadata:** pending orchestrator metadata commit

## Files Created/Modified

- `README.md` - Added minimal first-party GitHub Actions release-candidate note.
- `.planning/phases/03-smoke-test-branch-protection-and-v1-0-0-tag/03-RELEASE-DANCE.md` - Candidate SHA to ops smoke to tag choreography.
- `.planning/phases/03-smoke-test-branch-protection-and-v1-0-0-tag/03-EXTERNAL-SMOKE-EVIDENCE.md` - Manual external smoke evidence record and organisation ruleset notes.

## Decisions Made

- The release branch must merge to `main` before the candidate SHA is smoked.
- The final `v1.0.0` tag remains a manual Plan 03-04 checkpoint.
- Legacy branch protection returning 404 is not a blocker because an active organisation ruleset protects default branches.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 4 - External state mismatch] Branch protection is implemented as an organisation ruleset**
- **Found during:** Task 4 (Verify branch protection requires only local checks)
- **Issue:** The plan expected the legacy branch-protection endpoint, but `gh api repos/ColourWithin/.github/branches/main/protection` returned `404 Branch not protected`.
- **Fix:** Verified the active organisation ruleset through `gh api repos/ColourWithin/.github/rulesets/13867847` and `gh api orgs/ColourWithin/rulesets/13867847`, then recorded the real protection mechanism in the evidence file.
- **Files modified:** `.planning/phases/03-smoke-test-branch-protection-and-v1-0-0-tag/03-EXTERNAL-SMOKE-EVIDENCE.md`
- **Verification:** Ruleset `Protect default branch` is active, organisation-owned, targets `~DEFAULT_BRANCH`, and enforces deletion, non-fast-forward, linear history, required signatures, and pull-request rules.
- **Committed in:** `1e31a05`

---

**Total deviations:** 1 auto-fixed (1 external state mismatch)
**Impact on plan:** The protection evidence now reflects the real GitHub configuration. No repo settings were changed.

## Issues Encountered

External smoke has not been run yet. `03-EXTERNAL-SMOKE-EVIDENCE.md` remains `Status: pending` by design until the release branch lands on `main` and `colour-within-ops` smokes the exact `origin/main` SHA.

## Verification

- `rg "First-party GitHub Actions|ColourWithin/.github/actions/oci-token-exchange@<sha>|ColourWithin/.github/actions/run-oci-cli-command@<sha>|docs/actions/|v1.0.0" README.md` passed.
- `rg 'git rev-parse origin/main|workflow input `candidate_sha`|git rev-list -n 1 v1.0.0|Do not create an unsigned' 03-RELEASE-DANCE.md` passed.
- `rg 'Candidate `.github` SHA|ColourWithin/colour-within-ops|oci os ns get|oci-cli-version|Protect default branch' 03-EXTERNAL-SMOKE-EVIDENCE.md` passed.
- `git diff --check` passed.

## User Setup Required

External smoke must be run from `colour-within-ops` after this branch is merged to `main`.

## Next Phase Readiness

Plan 03-04 is ready to stop at the manual final-tag checkpoint after external smoke evidence is filled and verified.

---
*Phase: 03-smoke-test-branch-protection-and-v1-0-0-tag*
*Completed: 2026-05-09*
