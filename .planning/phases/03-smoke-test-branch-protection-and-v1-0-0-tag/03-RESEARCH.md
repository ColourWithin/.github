# Phase 3: Smoke Test, Branch Protection, and v1.0.0 Tag - Research

**Researched:** 2026-05-09
**Status:** Complete

## Research Question

What does planning need to know to release the two first-party OCI actions with truthful local gates, externally verified OCI smoke evidence from `colour-within-ops`, branch protection that can actually be enforced in this repo, and a manual `v1.0.0` tag?

## Key Findings

### GitHub Actions and OIDC

- GitHub OIDC token minting requires `permissions: id-token: write`; `contents: read` is commonly paired when checkout or repository contents are needed. The permission only enables token fetching and does not grant cloud access by itself.
- GitHub's OIDC reference supports custom audience values. This confirms the `colour-within-ops` smoke workflow can pass `audience: https://github.com/ColourWithin/colour-within-ops` to `actions/oci-token-exchange`.
- Same-repo actions can be referenced either by `owner/repo@ref` or by local path. For release proof, use `ColourWithin/.github/actions/<name>@<candidate-sha>` from `colour-within-ops`, because that exercises the same org-default repo path consumers use.
- Job summaries can be written through `$GITHUB_STEP_SUMMARY`. Use this in the external smoke workflow to record the candidate SHA, `oci os ns get` command, `oci-cli-version`, and pass/fail outcome for release evidence.

### Branch Protection Boundary

- Branch protection required status checks are repository-local check/status contexts. A workflow run in `colour-within-ops` is not automatically a required check on this `.github` repo's PR/commit.
- Therefore, `.github` branch protection should require local checks only: unit/static/package/release-readiness checks from `.github/workflows/test-actions.yml`.
- External `colour-within-ops` OCI smoke evidence must be a manual release gate before tagging, unless a future phase builds a reporting bridge back to this repo's commit status.

### External Smoke Workflow Shape

- The real OCI smoke workflow belongs in `colour-within-ops` because the IPT is pinned to that repo's OIDC subject.
- Required external smoke contract:
  - path: `.github/workflows/oci-ipt-smoke.yml`
  - trigger: `workflow_dispatch`
  - `environment: production`
  - `permissions: { id-token: write, contents: read }`
  - token-exchange input `audience: https://github.com/ColourWithin/colour-within-ops`
  - token-exchange action ref: `ColourWithin/.github/actions/oci-token-exchange@<candidate-sha>`
  - CLI wrapper ref: `ColourWithin/.github/actions/run-oci-cli-command@<candidate-sha>`
  - command: first choice `oci os ns get`; fallback read-only permission-scoped command if needed
  - no deploys, no mutations
  - fail loudly on token exchange, OCI auth, non-zero exit, invalid JSON where JSON is expected, or `oci-cli-version < 3.81.1`

### Dependency and Pinning Research

- Latest verified on 2026-05-09:
  - `actions/cache` v5.0.5, tag SHA `27d5ce7f107fe9357f9df03efb73ab90386fccae`
  - `actions/checkout` v6.0.2, tag SHA `de0fac2e4500dabe0009e67214ff5f5447ce83dd`
  - `rhysd/actionlint` v1.7.12, tag SHA `914e7df21a07ef503a81201c76d2b11c789d3fca`
  - Python package `oci` latest 2.173.1
  - Python package `oci-cli` latest 3.81.1
- Execution must re-check these before changing workflow pins, because the repo instruction requires latest dependencies and these versions can drift.
- `actionlint` is currently downloaded by URL. Planning should require version pin plus SHA256 checksum verification of the `linux_amd64` tarball before extracting.

### Local Workflow Pattern

- Current `.github/workflows/test-actions.yml` already contains the useful local gates:
  - SHA-pinned checkout
  - Python dependency install
  - ruff
  - actionlint
  - no `set -x`
  - no `${{ inputs.* }}` in composite `run:` bodies
  - pytest
  - npm ci/test/typecheck/audit/license/build/dirty-dist
  - no shell execution primitives in TypeScript source
- Phase 3 should extend this workflow without replacing the existing guardrails.
- Add pip cache with `actions/cache@<full-sha>` keyed by `hashFiles('actions/oci-token-exchange/requirements.txt')` and Python/runtime context. Since the external real smoke lives in `colour-within-ops`, this cache applies to the local Python/unit gate rather than a local OCI smoke.
- Add release-readiness checks that are local and deterministic:
  - workflow has no tag-pinned third-party `uses:`
  - actionlint tarball checksum is verified
  - required top-level/docs release text exists
  - `v1.0.0` tag does not already exist before release-gate execution
  - no local workflow job attempts real OCI token exchange from this repo

### Documentation and Release Evidence

- Top-level `README.md` should remain minimal because this is internal. Add a concise section naming both actions, showing the SHA-pinned `ColourWithin/.github/actions/<name>@<sha>` entry point, and linking to `docs/actions/`.
- Detailed prerequisites remain in action docs and `docs/actions/*`.
- Add an external smoke handoff doc with:
  - exact `colour-within-ops` workflow skeleton
  - candidate SHA input
  - required permissions/environment/audience
  - `oci os ns get` first-choice command
  - evidence fields to capture: run URL, candidate SHA, command, exit code, `oci-cli-version`, JSON parse result, approval timestamp
- Tagging should be manual after local checks and external smoke evidence are verified.

## Recommended Plan Shape

1. Correct local truth and release-readiness gates:
   - Update stale Phase 3 requirement/roadmap wording so it no longer claims this repo performs real OCI smoke.
   - Harden `.github/workflows/test-actions.yml` with checksum-verified actionlint, pip cache, and local release-readiness assertions.
2. Create external smoke handoff docs:
   - Add the `colour-within-ops` workflow skeleton and evidence checklist.
   - Link it from action docs.
3. Release gate and tag:
   - Update top-level README with minimal v1.0.0 internal release note.
   - Verify local checks exist/pass.
   - Verify recorded `colour-within-ops` smoke evidence for the candidate SHA.
   - Apply branch protection for local checks only.
   - Stop for human approval before tagging `v1.0.0`.

## Validation Architecture

### Automated Local Validation

- Run full local workflow-equivalent command:

```bash
python -m pip install 'oci>=2.173.1,<3' requests cryptography pytest ruff
ruff check actions/oci-token-exchange/
pytest actions/oci-token-exchange/tests/ -v
cd actions/run-oci-cli-command
npm ci
npm test -- --run
npm run typecheck
npm audit --audit-level=high
npm run licenses
npm run build
git diff --exit-code -- dist/index.js
```

- Run static workflow checks:
  - `actionlint .github/workflows/test-actions.yml`
  - grep no `set -x` / `set -o xtrace` in action source
  - grep no TypeScript shell execution primitives
  - verify third-party `uses:` values are full SHAs, not tags
  - verify actionlint tarball download is checksum-checked

### Manual Validation

- External smoke run in `colour-within-ops` is manual and must be recorded before tag:
  - workflow: `.github/workflows/oci-ipt-smoke.yml`
  - candidate SHA: exact commit from this `.github` repo
  - command: `oci os ns get` unless documented fallback used
  - result: success URL and summary proving token exchange and OCI auth passed

## Sources

- GitHub Docs - OpenID Connect reference: https://docs.github.com/en/actions/reference/security/oidc
- GitHub Docs - Using pre-written building blocks in workflows: https://docs.github.com/actions/learn-github-actions/finding-and-customizing-actions
- GitHub Docs - REST API endpoints for protected branches: https://docs.github.com/en/rest/branches/branch-protection
- GitHub Docs - Managing environments for deployment: https://docs.github.com/en/actions/reference/environments
- GitHub Docs - Workflow commands for GitHub Actions: https://docs.github.com/en/actions/reference/workflow-commands-for-github-actions
- Local checks: `gh release view`, `git ls-remote`, and `pip index versions` run on 2026-05-09.

## RESEARCH COMPLETE
