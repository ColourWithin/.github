---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: Tag
status: paused
stopped_at: "Phase 3 paused before 03-04 tag creation: OCI/OIDC smoke path on hold"
last_updated: "2026-05-10T06:58:56+10:00"
last_activity: 2026-05-10 -- Phase 03 paused; OIDC/IPT smoke path on hold
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 7
  completed_plans: 4
  percent: 57
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-09)

**Core value:** Workflows authenticate to OCI as properly-classified Service User via short-lived UPSTs, replacing unmaintained third-party actions.
**Current focus:** Phase 03 — smoke-test-branch-protection-and-v1-0-0-tag

## Current Position

Phase: 03 (smoke-test-branch-protection-and-v1-0-0-tag) — PAUSED
Plan: 4 of 4
Status: Paused before signed `v1.0.0` tag creation; external OCI/OIDC smoke evidence is on hold
Last activity: 2026-05-10 -- Phase 03 paused; OIDC/IPT smoke path on hold

Progress: [██████░░░░] 57%

## Performance Metrics

**Velocity:**

- Total plans completed: 3
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 — Token Exchange | 2/2 | 25 min | 12.5 min |
| 2 — CLI Wrapper | 1/1 | 55 min | 55 min |
| 3 — Smoke Test + Tag | — | — | — |
| Phase 01 P01 | 18 min | 2 tasks | 6 files |
| Phase 01 P02 | 7 min | 3 tasks | 3 files |
| Phase 02 P01 | 55 min | 6 tasks | 39 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Recent:

- Init: First-party actions over forking stale upstreams (CVE + wrong principal type)
- Phase 02: Action 2 pivoted to TypeScript JavaScript action with ncc bundle, argv-safe execution, and npm dependency gates
- Init: SHA-pin consumption pattern; smoke tests against real OCI personal tenancy

### Pending Todos

None yet.

### Blockers/Concerns

- **Phase 3 external dependency:** Smoke test requires `colour-within-ops` Phase 02 B to populate `OCI_OIDC_CLIENT_IDENTIFIER` / `OCI_OIDC_CLIENT_SECRET` / `OCI_DOMAIN_BASE_URL` in this repo's secrets/vars before required check is activated
- **Phase 3 release hold:** OCI/OIDC Identity Propagation Trust smoke testing is on hold because the current auth path does not work reliably enough to support `v1.0.0` release evidence. Do not create or push `v1.0.0` until a real `colour-within-ops` smoke workflow passes against the exact `.github` candidate SHA.
- **PRD typo correction:** `requested_token_type` literal is `urn:oci:token-type:oci-upst` (not the shorter form in PRD §3) — captured in TOKEX-04
- **Multiline secret masking:** UPST must be `.strip()`'d before `core.setSecret` (toolkit issue #1421) — captured in TOKEX-08

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Token Exchange Hardening | TOKEX-V2-01 (`workload` principal-type assertion) | Deferred to v1.1 | 2026-05-09 init |
| Token Exchange Hardening | TOKEX-V2-02 (audience validation) | Deferred to v1.1 | 2026-05-09 init |
| Operator UX | CLIRUN-V2-01, CLIRUN-V2-02 | Deferred to v2 | 2026-05-09 init |
| Multi-Tenancy | MULTI-V2-01 | Deferred to v2 | 2026-05-09 init |

## Session Continuity

Last session: 2026-05-10T06:58:56+10:00
Stopped at: Phase 3 paused before 03-04: OIDC/IPT smoke path on hold
Resume file: .planning/phases/03-smoke-test-branch-protection-and-v1-0-0-tag/03-EXTERNAL-SMOKE-EVIDENCE.md
