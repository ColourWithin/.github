---
phase: 02-oci-cli-wrapper-action
plan: 01
subsystem: actions
tags: [github-actions, oci-cli, typescript, ncc, shell-quote]
requires:
  - phase: 01-oci-token-exchange-action
    provides: OCI CLI security-token config and Phase 1 Python gates
provides:
  - TypeScript JavaScript action for argv-safe OCI CLI command execution
  - Version-aware OCI CLI install/upgrade behavior for oci-cli>=3.81.1
  - Captured output, raw-output, exit-code, and oci-cli-version action outputs
  - npm test, typecheck, audit, license, build, and dirty-dist CI gates
affects: [phase-03-smoke-test, colourwithin-actions-consumers]
tech-stack:
  added: [@actions/core, @actions/exec, @actions/io, shell-quote, @vercel/ncc, typescript, vitest]
  patterns: [action-local npm package, committed ncc bundle, argv-only command execution, version-aware install sentinel]
key-files:
  created:
    - actions/run-oci-cli-command/action.yml
    - actions/run-oci-cli-command/src/command.ts
    - actions/run-oci-cli-command/src/install.ts
    - actions/run-oci-cli-command/src/index.ts
    - actions/run-oci-cli-command/dist/index.js
    - actions/run-oci-cli-command/README.md
    - docs/actions/run-oci-cli-command.md
  modified:
    - .planning/PROJECT.md
    - .planning/REQUIREMENTS.md
    - .github/workflows/test-actions.yml
key-decisions:
  - "Used latest @actions/* v3 packages and patched local package exports during ncc build instead of downgrading."
  - "Kept runtime dependency license checking production-only with private package exclusion."
patterns-established:
  - "JavaScript actions in this repo use an action-local npm package and commit ncc dist output."
  - "User command strings are parsed into argv and rejected on shell syntax before execution."
requirements-completed: [CLIRUN-01, CLIRUN-02, CLIRUN-03, CLIRUN-04, CLIRUN-05, CLIRUN-06, CLIRUN-07, CLIRUN-08]
duration: 55min
completed: 2026-05-09
---

# Phase 02 Plan 01: OCI CLI Wrapper Action Summary

**TypeScript Node 24 action for safe OCI CLI argv execution, version-aware install, captured outputs, docs, and CI gates**

## Performance

- **Duration:** 55 min
- **Started:** 2026-05-09T12:01:00Z
- **Completed:** 2026-05-09T12:56:20Z
- **Tasks:** 6
- **Files modified:** 39

## Accomplishments

- Added `actions/run-oci-cli-command` as a TypeScript JavaScript action with committed `dist/index.js`.
- Implemented shell-quote parsing that requires leading `oci`, appends optional `query`, validates working directories, and rejects shell control syntax.
- Implemented `oci-cli>=3.81.1` detection/install/upgrade with PATH export and a version-aware `~/.oci-cli-installed` sentinel.
- Wrote outputs before non-zero failure: `output`, `raw-output`, `exit-code`, and `oci-cli-version`.
- Extended CI with npm test/typecheck/audit/license/build/dirty-dist gates while preserving Phase 1 Python gates.
- Replaced stale bash-only planning/docs wording with the TypeScript action contract.

## Task Commits

1. **Task 1: Scaffold package and tests** - `c4da23a`
2. **Task 2: Command parsing** - `af38e16`
3. **Task 3: OCI CLI install/version sentinel** - `95847f6`
4. **Task 4: Action orchestration and outputs** - `89de3c6`
5. **Task 5: Bundle and docs** - `0e95ff9`
6. **Task 6: CI gates** - `81f460a`
7. **Final stale-contract cleanup** - `52efb89`

**Plan metadata:** this summary commit.

## Files Created/Modified

- `actions/run-oci-cli-command/action.yml` - Node 24 action metadata and I/O contract.
- `actions/run-oci-cli-command/src/command.ts` - Safe parser and working-directory resolver.
- `actions/run-oci-cli-command/src/install.ts` - OCI CLI version check, install/upgrade, PATH export, sentinel.
- `actions/run-oci-cli-command/src/index.ts` - Runtime orchestration via `@actions/exec`.
- `actions/run-oci-cli-command/tests/` - Vitest coverage for parser, install, and orchestration behavior.
- `actions/run-oci-cli-command/dist/index.js` - ncc bundle consumable from a pinned SHA.
- `.github/workflows/test-actions.yml` - Phase 1 plus Phase 2 automated gates.

## Decisions Made

- Kept latest dependencies verified on 2026-05-09. `@actions/core@3.0.1` and `@actions/exec@3.0.0` are ESM export-map packages that ncc 0.38.4 could not resolve directly, so the build script patches their local `node_modules` export metadata after `npm ci` and before bundling.
- Kept license checking scoped to production runtime dependencies with `--excludePrivatePackages`; the private action package itself is not a bundled third-party runtime dependency.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Replayed Phase 1 implementation into the Phase 2 branch**
- **Found during:** Branch setup
- **Issue:** The clean Phase 2 branch from `origin/main` had Phase 2 planning but did not include Phase 1 action code, while Phase 2 verification explicitly re-runs Phase 1 gates.
- **Fix:** Cherry-picked Phase 1 implementation, tests, workflow, and docs commits onto the Phase 2 branch before implementation.
- **Files modified:** `actions/oci-token-exchange/`, `.github/workflows/test-actions.yml`, `docs/actions/`
- **Verification:** Phase 1 pytest and ruff gates passed.
- **Committed in:** existing Phase 1 commits on this branch.

**2. [Rule 3 - Blocking] Removed accidentally committed `node_modules`**
- **Found during:** Task 1 commit review
- **Issue:** Initial npm install output was accidentally staged into the scaffold commit.
- **Fix:** Removed `node_modules` from git history for the task commit and added `node_modules/` to `.gitignore`.
- **Files modified:** `.gitignore`
- **Verification:** `git status` no longer listed tracked `node_modules`; later `npm ci` gates passed.
- **Committed in:** `c4da23a`

**3. [Rule 3 - Blocking] Added ncc compatibility patch for latest @actions toolkit packages**
- **Found during:** Task 5 build
- **Issue:** `@actions/core@3.0.1` and `@actions/exec@3.0.0` publish import-only package exports that ncc 0.38.4 could not resolve in this CommonJS action bundle.
- **Fix:** Added `scripts/patch-actions-toolkit-exports.mjs` and ran it before ncc to add local `require`/`default` entries after `npm ci`.
- **Files modified:** `actions/run-oci-cli-command/package.json`, `actions/run-oci-cli-command/scripts/patch-actions-toolkit-exports.mjs`
- **Verification:** `npm run build` passes after fresh `npm ci`; generated `dist/index.js` remains fresh.
- **Committed in:** `0e95ff9`

---

**Total deviations:** 3 auto-fixed (blocking/build/repo hygiene)
**Impact on plan:** No scope expansion. Fixes were required to preserve the plan's verification contract while staying on latest dependencies.

## Issues Encountered

- `license-checker-rseidelsohn` treated the private root package as `UNLICENSED` for `--onlyAllow`; resolved by adding `license: MIT` and excluding private packages from the production runtime dependency scan.
- Current `license-checker-rseidelsohn` transitive dev dependencies emit npm deprecation warnings for `read-package-json` and `glob`, but `npm audit --audit-level=high` reports zero vulnerabilities and the package version is the latest available.

## User Setup Required

None - no external service configuration required for Phase 2 local validation.

## Verification

Passed:

- `uv run --with 'oci>=2.173.1,<3' --with requests --with cryptography --with pytest --with ruff pytest actions/oci-token-exchange/tests/ -v`
- `uv run --with 'oci>=2.173.1,<3' --with requests --with cryptography --with pytest --with ruff ruff check actions/oci-token-exchange/`
- `cd actions/run-oci-cli-command && npm ci && npm test -- --run && npm run typecheck && npm audit --audit-level=high && npm run licenses && npm run build && git diff --exit-code -- dist/index.js`
- `! grep -rE "child_process\\.exec\\b|execSync\\b|shell: true" actions/run-oci-cli-command/src/`
- `actionlint .github/workflows/test-actions.yml`
- stale bash-only scan across `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `actions/run-oci-cli-command/README.md`, and `docs/actions`

## Next Phase Readiness

Phase 3 can consume both actions in a real OCI smoke workflow. The remaining blocker is external: repo secrets/vars from `colour-within-ops` still need to exist before making the smoke workflow a required branch-protection check.

---
*Phase: 02-oci-cli-wrapper-action*
*Completed: 2026-05-09*
