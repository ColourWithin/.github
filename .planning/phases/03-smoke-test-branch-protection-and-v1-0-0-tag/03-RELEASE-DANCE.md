# Phase 3 Release Choreography

## Sequence

1. Merge the Phase 3 release branch to `main`.
2. Fetch and record the authoritative candidate SHA:
   `git fetch origin main --tags`
   `git rev-parse origin/main`
3. Run `colour-within-ops/.github/workflows/oci-ipt-smoke.yml` with `candidate_sha=<origin/main-sha>`.
4. Record the workflow run URL and results in `03-EXTERNAL-SMOKE-EVIDENCE.md`.
5. Verify the smoke workflow input SHA equals `git rev-parse origin/main`.
6. Verify local branch protection requires only local `.github` checks.
7. Plan 03-04 creates signed tag `v1.0.0` at that same SHA after explicit user approval.

## Equality Checks

- `03-EXTERNAL-SMOKE-EVIDENCE.md` candidate SHA equals `git rev-parse origin/main`
- `colour-within-ops` workflow input `candidate_sha` equals `git rev-parse origin/main`
- `git rev-list -n 1 v1.0.0` equals `git rev-parse origin/main` after tag creation

## Non-Negotiables

- Do not tag a local-only commit that has not landed on `main`.
- Do not tag a commit different from the SHA smoke-tested by `colour-within-ops`.
- Do not create an unsigned `v1.0.0` tag.
- Do not require `colour-within-ops` checks in `.github` branch protection.
