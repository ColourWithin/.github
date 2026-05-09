# Phase 3 External Smoke Evidence

**Status:** pending
**Candidate `.github` SHA:** <fill with `git rev-parse origin/main` after release branch merge>
**Consumer repo:** `ColourWithin/colour-within-ops`
**Workflow:** `.github/workflows/oci-ipt-smoke.yml`
**Environment:** `production`
**Audience:** `https://github.com/ColourWithin/colour-within-ops`
**Command:** `oci os ns get`

## Required Before Tag

- [ ] Workflow run URL recorded
- [ ] Candidate SHA in workflow input matches this repo commit
- [ ] `actions/oci-token-exchange` used `@<candidate-sha>`
- [ ] `actions/run-oci-cli-command` used `@<candidate-sha>`
- [ ] Token exchange step passed
- [ ] OCI command exit code was `0`
- [ ] OCI command stdout parsed as JSON
- [ ] `oci-cli-version` was `>=3.81.1`
- [ ] No deploy or mutation step ran

## Branch Protection

**Status:** verified via organisation ruleset
**Legacy branch protection endpoint:** `gh api repos/ColourWithin/.github/branches/main/protection` returned `404 Branch not protected`
**Ruleset:** `Protect default branch` (`id: 13867847`)
**Ruleset source:** `Organization`
**Ruleset target:** `branch`
**Ruleset enforcement:** `active`
**Ruleset conditions:** default branch (`~DEFAULT_BRANCH`) for all ColourWithin repositories
**Rules enforced:** deletion protection, non-fast-forward protection, required linear history, required signatures, pull request rule with review-thread resolution
**Required status checks:** none configured in the current organisation ruleset
**External check contexts required:** none

The active organisation ruleset is the protection mechanism for `main`. Do not add `colour-within-ops` as a required status check context for this repo. If the release process later requires status checks in the organisation ruleset, use only local `.github` workflow contexts such as `Unit tests and lint`.

## Evidence

- Workflow run URL:
- Run date:
- Operator:
- `exit-code`:
- `oci-cli-version`:
- JSON parse result:
- Notes:
