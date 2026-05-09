---
phase: 03-smoke-test-branch-protection-and-v1-0-0-tag
plan: 02
subsystem: documentation
tags: [oci, smoke-test, github-actions, colour-within-ops]
requires:
  - phase: 01-oci-token-exchange-action
    provides: token-exchange action contract
  - phase: 02-oci-cli-wrapper-action
    provides: OCI CLI command action contract
provides:
  - External colour-within-ops OCI IPT smoke workflow skeleton
  - Pre-tag evidence checklist for candidate .github SHA
  - Action README links to detailed smoke handoff docs
affects: [phase-03, release-gate, ops-handoff]
tech-stack:
  added: []
  patterns: [external smoke handoff, candidate-sha action refs, auth-only smoke evidence]
key-files:
  created:
    - docs/actions/oci-ipt-smoke.md
  modified:
    - docs/actions/README.md
    - actions/oci-token-exchange/README.md
    - actions/run-oci-cli-command/README.md
key-decisions:
  - "The real smoke workflow lives in colour-within-ops because that repo is the trusted IPT subject."
  - "The smoke workflow uses candidate SHA action refs and proves auth only with oci os ns get."
patterns-established:
  - "Detailed operator smoke docs live under docs/actions and action READMEs link to them."
requirements-completed: [SMOKE-02, SMOKE-03, SMOKE-04, SMOKE-05, REL-02, REL-04]
duration: 5 min
completed: 2026-05-09
---

# Phase 03 Plan 02: External OCI IPT Smoke Handoff Summary

**Ops-owned OCI IPT smoke handoff with manual workflow skeleton, candidate-SHA action refs, and pre-tag evidence checklist**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-09T14:27:00Z
- **Completed:** 2026-05-09T14:32:28Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added `docs/actions/oci-ipt-smoke.md` with the exact `colour-within-ops/.github/workflows/oci-ipt-smoke.yml` shape.
- Documented `workflow_dispatch`, `environment: production`, `id-token: write`, `contents: read`, ops audience, candidate SHA action refs, and `oci os ns get`.
- Added Python-based JSON parsing and numeric semantic-version comparison for `oci-cli-version >= 3.81.1`.
- Added fallback read-only command guidance using `secrets.OCI_SMOKE_COMPARTMENT_OCID`.
- Linked the smoke handoff from `docs/actions/README.md` and both action READMEs.

## Task Commits

1. **Task 1: Add external OCI IPT smoke handoff doc** - `041de3d`
2. **Task 2: Link smoke handoff from docs index and action READMEs** - `041de3d`
3. **Task 3: Verify docs remain concise and internally consistent** - no file change; verification passed

**Plan metadata:** pending orchestrator metadata commit

## Files Created/Modified

- `docs/actions/oci-ipt-smoke.md` - External smoke workflow skeleton and evidence checklist.
- `docs/actions/README.md` - Added OCI IPT smoke handoff link.
- `actions/oci-token-exchange/README.md` - Added ops smoke audience note and detailed-doc link.
- `actions/run-oci-cli-command/README.md` - Added smoke-test command note and detailed-doc link.

## Decisions Made

- The smoke skeleton includes no deploy or mutation command.
- Pre-release smoke must use `candidate_sha`, not release tags.
- There is no cross-repo status bridge in v1.0; evidence remains a manual pre-tag record.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Verification

- `rg "workflow_dispatch|production|id-token: write|https://github.com/ColourWithin/colour-within-ops|oci os ns get|GITHUB_STEP_SUMMARY|OCI_SMOKE_COMPARTMENT_OCID" docs/actions/oci-ipt-smoke.md` passed.
- `rg "OCI IPT Smoke Test|colour-within-ops smoke audience|Smoke-test command|oci-ipt-smoke.md|oci os ns get|https://github.com/ColourWithin/colour-within-ops" docs/actions/README.md actions/oci-token-exchange/README.md actions/run-oci-cli-command/README.md` passed.
- Negative checks for `@v1.0.0`, `terraform apply`, `tofu apply`, `docker/login-action`, and `oci ... delete` in `docs/actions/oci-ipt-smoke.md` passed.

## User Setup Required

None in this repo. The ops team still needs to create the documented workflow in `colour-within-ops`.

## Next Phase Readiness

Plan 03-03 can now create the top-level release note, release choreography doc, external smoke evidence template, and branch-protection verification around the documented handoff.

---
*Phase: 03-smoke-test-branch-protection-and-v1-0-0-tag*
*Completed: 2026-05-09*
