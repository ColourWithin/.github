---
milestone: v1.0
name: OCI Composite Actions
status: planning
progress:
  phases_completed: 0
  phases_total: 3
  plans_completed: 0
  plans_total: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-09)

**Core value:** Workflows authenticate to OCI as properly-classified Service User via short-lived UPSTs, replacing unmaintained third-party actions.
**Current focus:** Phase 1 — OCI Token Exchange Action (not started)

## Current Position

Phase: 1 of 3 (OCI Token Exchange Action)
Plan: — (not yet planned)
Status: Ready to plan
Last activity: 2026-05-09 — /gsd-new-project init complete (PROJECT, REQUIREMENTS, ROADMAP, research)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 — Token Exchange | — | — | — |
| 2 — CLI Wrapper | — | — | — |
| 3 — Smoke Test + Tag | — | — | — |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Recent:

- Init: First-party actions over forking stale upstreams (CVE + wrong principal type)
- Init: Action 1 = composite + Python with `oci>=2.173.1,<3` (current floor verified); Action 2 = bash-only composite
- Init: SHA-pin consumption pattern; smoke tests against real OCI personal tenancy

### Pending Todos

None yet.

### Blockers/Concerns

- **Phase 3 external dependency:** Smoke test requires `colour-within-ops` Phase 02 B to populate `OCI_OIDC_CLIENT_IDENTIFIER` / `OCI_OIDC_CLIENT_SECRET` / `OCI_DOMAIN_BASE_URL` in this repo's secrets/vars before required check is activated
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

Last session: 2026-05-09
Stopped at: /gsd-new-project complete; ready for /gsd-plan-phase 1
Resume file: None
