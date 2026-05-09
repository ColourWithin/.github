# Phase 2: OCI CLI Wrapper Action - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 2-OCI CLI Wrapper Action
**Areas discussed:** Command contract, TypeScript architecture pivot, install sentinel, output and failure semantics, operator logging, build artifact policy, dependency hygiene, command parser dependency, test strategy, requirement/source-doc updates, action layout, OCI CLI version ownership, working directory validation, multiline stdout

---

## Initial Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Command contract | Leading `oci`, multiline commands, `--query` handling, and command execution shape | Yes |
| Install sentinel | Simple sentinel vs version-aware sentinel for repeated CLI installs | Yes |
| Output and failure semantics | Outputs on failure, stdout/stderr handling, and failure API | Yes |
| Operator logging | `silent` behavior, redaction, and lifecycle log shape | Yes |

**User's choice:** Discuss all four.
**Notes:** The discussion later expanded after the user challenged the bash-only premise.

---

## Command Contract

| Question | Selected | Notes |
|----------|----------|-------|
| How strict should the required leading `oci` literal be? | Exact first word | Trim whitespace, parse shell words, and require first word exactly `oci`. |
| How should `query` behave if command already includes `--query`? | Reject conflict | Fail clearly when both command and `query` input specify a query. |
| Should multiline `command` be supported? | Single command only | YAML whitespace/folding is fine, but shell control separators are rejected. |
| How should arguments be executed? | Reopened by TypeScript challenge | Original bash/string execution question was superseded by TypeScript argv execution. |

**User's choice:** Strict first-word validation, conflict rejection, single command only.
**Notes:** The user then asked whether TypeScript would be easier, explicitly citing their experience developing the original upstream Oracle action.

---

## TypeScript Architecture Pivot

| Option | Description | Selected |
|--------|-------------|----------|
| Switch to TypeScript | Supersede bash-only assumption; use `@actions/core`/`@actions/exec`, committed `dist`, dependency gates | Yes |
| Stay bash-only | Preserve PRD/requirements exactly and keep minimal composite | |
| Hybrid composite + script | Composite wrapper calls a checked-in JS/TS-built script | |

**User's choice:** Switch to TypeScript.
**Notes:** Current toolkit versions were checked during discussion: `@actions/core` 3.0.1, `@actions/exec` 3.0.0, `@actions/io` 3.0.2. The prior bash-only assumption in `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, and PRD source text is superseded.

---

## TypeScript Command Execution

| Option | Description | Selected |
|--------|-------------|----------|
| Parse and exec argv | Parse `oci ...` with shell-like quoting, call `@actions/exec` with binary plus argv | Yes |
| Shell execution | Run through a shell after validation | |
| Structured inputs later | Design toward future structured inputs but not v1 path | |

**User's choice:** Parse to argv and execute with `@actions/exec`.
**Notes:** No shell execution in Phase 2.

---

## Install Sentinel

| Question | Selected | Notes |
|----------|----------|-------|
| How should OCI CLI installation work? | Action installs if needed | Install or upgrade `oci-cli>=3.81.1` when absent or stale. |
| What should the sentinel record? | Version-aware sentinel | Skip repeated installs only when the current binary satisfies the required floor. |
| Where should the action install `oci-cli`? | `pip --user` on runner Python | Use `python -m pip install --user 'oci-cli>=3.81.1'` and ensure user bin is on `PATH`. |
| If `oci --version` exists but is below the floor? | Upgrade automatically | Use `--upgrade`, update PATH/sentinel, proceed. |

**User's choice:** Independently install/upgrade with a version-aware sentinel.
**Notes:** `oci-cli` latest was checked during discussion: 3.81.1.

---

## Output and Failure Semantics

| Question | Selected | Notes |
|----------|----------|-------|
| On non-zero OCI exit, write outputs before failing? | Always write outputs | Then call `core.setFailed`. |
| What should `output` contain? | Trimmed stdout only | `raw-output` preserves stdout exactly. |
| How should stderr be handled? | Log stderr live | Do not merge stderr into stdout outputs. |
| Add a `fail-on-error` input? | No new input | Use native `continue-on-error` when needed. |

**User's choice:** Outputs always set before failure; stdout/stderr remain separate.
**Notes:** Later multiline-output discussion refined exact raw-output and stdout live-stream behavior.

---

## Operator Logging

| Question | Selected | Notes |
|----------|----------|-------|
| What should `silent: false` show? | Quoted command summary | Log parsed, shell-quoted executable plus argv. |
| What should `silent: true` hide? | Hide command only | Still show status and stderr. |
| Extra redaction beyond Action 1 masks? | No blanket redaction | `silent: true` covers secret-bearing command args. |
| Install/progress messages? | Concise lifecycle messages | Version check, install/upgrade when needed, command start, final exit code. |

**User's choice:** Visible by default, but not blanket-masked.
**Notes:** Later working-directory discussion added resolved working directory logging when `silent: false`.

---

## Build Artifact Policy

| Question | Selected | Notes |
|----------|----------|-------|
| Commit bundled JavaScript? | Commit dist bundle | GitHub action must be usable from pinned SHA. |
| Preferred bundler? | `@vercel/ncc` | Current version checked: 0.38.4. |
| CI strictness for dist? | Fail on dirty dist | Rebuild in CI and fail if committed `dist/index.js` changes. |
| Review generated dist as source? | Review source + verify dist | Review `dist` only for unexpected size/dependency changes. |

**User's choice:** Commit and verify bundled `dist/index.js`.
**Notes:** The bundled-dist overhead is accepted because TypeScript is the safer implementation for this action.

---

## Dependency Hygiene

| Question | Selected | Notes |
|----------|----------|-------|
| Which npm checks now? | Install, test, audit, build, plus license check | Include `npm audit --audit-level=high` and permissive license gate. |
| License policy? | Permissive allowlist | MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, CC0-1.0, Unlicense. |
| Dependency pinning model? | Lockfile controls exact versions | `package.json` may use semver ranges; CI uses `npm ci`. |
| Automated dependency updates? | Add Dependabot now | Scope to npm deps for this action. |

**User's choice:** Fail-closed dependency hygiene with permissive license checking.
**Notes:** User explicitly added the license-check requirement to the recommended CI gates.

---

## Command Parser Dependency

| Question | Selected | Notes |
|----------|----------|-------|
| How parse `command` input? | Use a parser dependency | Subject to audit/license gates. |
| Which parser? | `shell-quote` | Current version checked: 1.8.3, MIT. |
| How handle shell syntax tokens? | Reject all operators/non-string artifacts, with JSON nuance | Accept only string argv tokens; JSON is allowed when it is a quoted string argument. |
| How document/test complex JSON args? | Explicit examples + tests | Cover `--from-json`, JMESPath `--query`, spaces, quotes, nested JSON strings. |

**User's choice:** Use `shell-quote`, reject shell behavior, preserve practical OCI JSON support.
**Notes:** User emphasized complex OCI CLI commands may need inline JSON.

---

## Test Strategy

| Question | Selected | Notes |
|----------|----------|-------|
| Level of non-OCI integration testing? | Fake `oci` integration tests | Prove argv, stdout/stderr, exit code, and failure behavior. |
| Install/upgrade fake-tool tests? | Fake Python/pip/oci version tests | Cover missing/current/old CLI and sentinel behavior. |
| Where should tests run? | Node test runner in action package | Tests live under `actions/run-oci-cli-command/`. |
| Should CI run both action suites after this phase? | Path-based conditional action tests | User corrected earlier answer: only test an action if it or shared workflow/tooling files are modified. |

**User's choice:** Strong fake integration coverage, path-filtered CI.
**Notes:** The final CI policy is conditional per action, not unconditional both-suites-on-every-change.

---

## Requirement and Source Doc Updates

| Question | Selected | Notes |
|----------|----------|-------|
| Update planning source docs for `CLIRUN-08`? | Update planning docs in Phase 2 | `.planning/REQUIREMENTS.md` and `.planning/PROJECT.md` should no longer claim bash-only. |
| Correct PRD-derived public docs? | Update user-facing docs too | Treat `PRD-composite-actions.md` as historical unless an amendment is needed. |
| Replace or supersede `CLIRUN-08`? | Replace directly | Do not add separate override requirement. |
| Project key-decision rationale? | Yes, record rationale | TypeScript for safer argv parsing/output capture despite bundled `dist`. |

**User's choice:** Correct planning and user-facing docs during Phase 2.
**Notes:** `02-CONTEXT.md` is not the only override; implementation should make source docs truthful too.

---

## Action Layout

| Question | Selected | Notes |
|----------|----------|-------|
| Package layout? | Self-contained action package | Own package, lockfile, tsconfig, src, dist, tests. |
| Test framework? | Vitest | Current version checked: 4.1.5, MIT. |
| Shared CI/tooling dependency handling? | Separate per-action install steps | Python only for token exchange; npm only for CLI wrapper. |
| Promote tooling to repo root now? | No root npm tooling yet | Promote later only if another TypeScript action appears. |

**User's choice:** Keep TypeScript tooling local to `actions/run-oci-cli-command/`.
**Notes:** Avoid premature root workspace.

---

## OCI CLI Version Ownership

| Question | Selected | Notes |
|----------|----------|-------|
| Expose CLI version floor as input? | Internal constant only | Document `oci-cli>=3.81.1`; no v1 input. |
| What happens when floor bumps later? | Action SHA controls floor | Consumers get new floor only when updating action SHA. |
| Expose installed version as output? | Yes, `oci-cli-version` | Useful for diagnostics and smoke tests. |
| Configurable sentinel path? | Internal path only | Document behavior, not path. |

**User's choice:** Keep version floor internal and reproducible by pinned SHA.

---

## Working Directory Validation

| Question | Selected | Notes |
|----------|----------|-------|
| If `working-directory` does not exist? | Fail clearly | Validate before command execution. |
| Must it be a directory? | Require directory | Fail if path exists but is not a directory. |
| Resolve relative paths against what? | `GITHUB_WORKSPACE` | Matches Actions expectations. |
| Print resolved working directory? | Yes when not silent | Log with command summary when `silent: false`. |

**User's choice:** Explicit validation and helpful non-silent logging.

---

## Multiline Stdout

| Question | Selected | Notes |
|----------|----------|-------|
| How preserve `raw-output`? | Exact stdout | Preserve trailing newlines via safe multiline output writing. |
| How trim `output`? | Trim surrounding whitespace | Matches requirement wording. |
| Empty stdout allowed? | Yes, empty string outputs | Still set `exit-code`. |
| Live-stream stdout too? | Live-stream stdout | User chose operator visibility over capture-only default. |

**User's choice:** Stream stdout live while capturing exact and trimmed outputs.

---

## the agent's Discretion

- Exact helper/module split, test fixture structure, sentinel path, package scripts, docs wording, and path-filter implementation.
- Whether to add an amendment note to the historical PRD is planner discretion unless needed for consistency.

## Deferred Ideas

- Caller-configurable `oci-cli-version-spec`.
- Caller-configurable `sentinel-path`.
- `fail-on-error` input.
- Extra blanket redaction or caller-supplied mask-values.
- Structured command inputs replacing `command`.
- Real OCI smoke tests before Phase 3.
- Root npm workspace before another TypeScript action exists.
