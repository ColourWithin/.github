# Phase 2: OCI CLI Wrapper Action - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers `actions/run-oci-cli-command`: a first-party GitHub JavaScript action that installs or upgrades the OCI CLI when needed, validates and parses a caller-provided `oci ...` command, executes it without a shell via `@actions/exec`, captures stdout/exit-code as action outputs, and provides operator-friendly logging for ColourWithin deployment workflows.

In scope: replacing the previous bash-only assumption with a TypeScript action, package/build/test setup under `actions/run-oci-cli-command/`, committed bundled `dist/index.js`, CLI install/version/sentinel behavior, command parsing and validation, stdout/stderr/output semantics, action README/docs, planning-doc updates for the TypeScript decision, Dependabot npm config, and CI gates for the new action package.

Out of scope: real OCI smoke-test activation, branch protection, v1.0.0 tagging, OIDC token exchange changes, OCI/IPT infrastructure, OCIR login, OKE kubeconfig, OCI error interpretation/retry, caller-configurable OCI CLI version floors, post-job cleanup, and structured command inputs beyond the v1 `command` string.

</domain>

<decisions>
## Implementation Decisions

### Architecture Pivot

- **D-01:** Supersede the previous bash-only `CLIRUN-08` assumption. Phase 2 must implement `actions/run-oci-cli-command` as a TypeScript JavaScript action because command parsing, argv-safe execution, output capture, and failure handling are more honest in TypeScript than in a shell-heavy composite action.
- **D-02:** Replace `CLIRUN-08` directly in `.planning/REQUIREMENTS.md` with a TypeScript action requirement rather than adding a separate override requirement.
- **D-03:** Update `.planning/PROJECT.md` to record the rationale: TypeScript is chosen for safer argv parsing and output capture despite committed bundled `dist` overhead.
- **D-04:** Update user-facing docs in Phase 2 so Action 2 is documented as a TypeScript action. Treat `PRD-composite-actions.md` as historical input unless planning explicitly decides an amendment note is needed.

### Package and Build Artifact Policy

- **D-05:** `actions/run-oci-cli-command/` is a self-contained npm package with its own `package.json`, `package-lock.json`, `tsconfig.json`, `src/`, `dist/`, and tests. Do not add root npm tooling yet; promote to a root workspace only if another TypeScript action appears later.
- **D-06:** Use `@vercel/ncc` to bundle `src/index.ts` into committed `dist/index.js`. The action must be consumable directly from a pinned SHA without a consumer-side build step.
- **D-07:** CI must run the build and fail if rebuilding changes committed `dist/index.js`.
- **D-08:** Reviewers should focus on TypeScript source, tests, and `package-lock.json`; CI verifies `dist/index.js` freshness. Review generated `dist` only for unexpected size or dependency changes.

### Dependency Hygiene

- **D-09:** Phase 2 CI must run `npm ci`, TypeScript tests/lint, `npm audit --audit-level=high`, a permissive-license allowlist check, `npm run build`, and dirty-dist verification.
- **D-10:** License allowlist: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, CC0-1.0, and Unlicense. Unknown, copyleft, or manual-review licenses fail.
- **D-11:** `package-lock.json` is the exact dependency contract. `package.json` may use normal semver ranges, and CI must use `npm ci`.
- **D-12:** Add Dependabot npm update configuration for `actions/run-oci-cli-command` in Phase 2.
- **D-13:** Dependency versions checked during discussion: `@actions/core` 3.0.1, `@actions/exec` 3.0.0, `@actions/io` 3.0.2, `@vercel/ncc` 0.38.4, `typescript` 6.0.3, `vitest` 4.1.5, `license-checker-rseidelsohn` 4.4.2, `shell-quote` 1.8.3, and `oci-cli` 3.81.1. Planner should re-check before implementation if package metadata has changed.

### Command Contract

- **D-14:** Trim the `command` input and require the first parsed shell word to be exactly `oci`. Fail clearly otherwise.
- **D-15:** The action runs a single OCI command only. Reject shell control operators and separators such as command-separator newlines, `;`, `&&`, and `||`.
- **D-16:** Prefer `shell-quote` for shell-like parsing and quoting, subject to tests and audit/license gates.
- **D-17:** Accept only plain string argv tokens from `shell-quote`. Reject shell operators, redirects, comments, substitutions, globs/non-string parse artifacts, env-assignment prefixes, or anything else that would move execution toward shell semantics.
- **D-18:** Inline JSON is allowed when it parses as a normal quoted string argument, for example `--from-json '{"key":"value"}'` or equivalent YAML-safe quoting. Tests must cover real OCI JSON payload arguments so the wrapper remains useful for complex OCI commands.
- **D-19:** If `command` already includes `--query` and the separate `query` input is also set, fail clearly. The `query` input is a convenience path only when the command does not already include a query argument.
- **D-20:** Execute via parsed argv with `@actions/exec`: binary `oci`, argv array, no shell execution.
- **D-21:** Keep `oci-cli>=3.81.1` as an internal source constant and documented floor; do not add a caller-configurable CLI version input in v1. The pinned action SHA controls the floor consumers receive.

### OCI CLI Install and Sentinel

- **D-22:** The action installs or upgrades `oci-cli` if needed, targeting `oci-cli>=3.81.1`, so the wrapper remains independently usable.
- **D-23:** Use runner Python with `python -m pip install --user 'oci-cli>=3.81.1'` and `--upgrade` when an existing `oci` binary is below the floor. Ensure the user bin directory is on `PATH`.
- **D-24:** Use a version-aware internal sentinel that records enough information to skip repeat installs only when the current `oci` binary satisfies the required floor. The sentinel path is not a public input or stable contract.
- **D-25:** Add an `oci-cli-version` output for diagnostics and Phase 3 smoke-test assertions.

### Output and Failure Semantics

- **D-26:** Always write `output`, `raw-output`, `exit-code`, and `oci-cli-version` outputs before failing on a non-zero OCI exit.
- **D-27:** `output` is stdout with surrounding whitespace trimmed. `raw-output` preserves stdout exactly, including trailing newlines, using safe multiline output writing.
- **D-28:** Empty stdout is valid. Set `output` and `raw-output` to empty strings and still set `exit-code`.
- **D-29:** Stream stdout live to the GitHub log while also capturing it for outputs. Stream stderr live to the GitHub log; do not merge stderr into stdout outputs.
- **D-30:** Do not add a `fail-on-error` input. Non-zero OCI exit writes outputs, then calls `core.setFailed`; callers who need continuation use native step-level `continue-on-error`.

### Operator Logging

- **D-31:** With `silent: false`, log a parsed shell-quoted command summary showing executable plus argv as the action will execute it. Also log the resolved working directory.
- **D-32:** With `silent: true`, hide only the command/argv summary. Still show concise lifecycle/status messages and stream stdout/stderr so failures remain diagnosable.
- **D-33:** Do not add extra blanket redaction in Phase 2. Rely on Action 1's masks for UPST/client-secret values, and document that `silent: true` is for commands whose arguments contain sensitive values.
- **D-34:** Use concise lifecycle messages: version check, install/upgrade only when needed, command start, and final exit code.

### Working Directory

- **D-35:** If `working-directory` does not exist, fail clearly before running the command.
- **D-36:** `working-directory` must exist and be a directory.
- **D-37:** Resolve relative `working-directory` values against `GITHUB_WORKSPACE`.

### Tests and CI Routing

- **D-38:** Use Vitest for TypeScript action tests.
- **D-39:** Include fake-`oci` integration tests that prove argv passing, stdout/raw-output trimming, exact raw-output preservation, stdout/stderr live-stream behavior, exit-code outputs, and failure behavior without real OCI.
- **D-40:** Cover install/upgrade behavior with temp PATH shims for fake `python`/`pip`/`oci` flows, including missing/current/old CLI cases and version-aware sentinel behavior.
- **D-41:** Tests live under `actions/run-oci-cli-command/` and run through that package's npm test command in CI.
- **D-42:** Existing Phase 1 Python gates stay in the workflow, and Phase 2 adds npm gates. CI should use path-based conditions so an action's test suite runs when that action or relevant shared workflow/tooling files are modified, rather than always running both action suites.
- **D-43:** Use separate per-action install/test steps: Python deps install only for token-exchange tests; npm deps install only for run-oci-cli-command tests.

### Documentation

- **D-44:** README/examples must cover safe JSON quoting and parser behavior for `--from-json`, JMESPath `--query`, spaces, quotes, and nested JSON strings.
- **D-45:** README must document the `oci-cli>=3.81.1` floor, install/upgrade behavior, version-aware sentinel behavior, `oci-cli-version` output, `silent` semantics, output semantics, and the relationship to `actions/oci-token-exchange`.

### the agent's Discretion

- Exact implementation split across helper modules, class/function names, and test fixture structure.
- Exact internal sentinel file path, as long as it is internal and version-aware.
- Exact package scripts and lint command shape, as long as the required CI gates exist.
- Exact wording of docs and error messages, as long as validation failures are clear and actionable.
- Exact path-filter implementation, as long as each action's tests run when that action or relevant shared workflow/tooling changes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project and Requirements
- `.planning/PROJECT.md` — project core value, active action requirements, current key decisions to update for TypeScript Action 2.
- `.planning/REQUIREMENTS.md` — CLIRUN-01..08 acceptance criteria; CLIRUN-08 must be replaced with the TypeScript action requirement.
- `.planning/ROADMAP.md` — Phase 2 goal, dependency on Phase 1, success criteria, and single-plan scaffold.
- `.planning/STATE.md` — current status: Phase 1 complete, Phase 2 ready to plan.
- `.planning/phases/01-oci-token-exchange-action/01-CONTEXT.md` — Phase 1 outputs and decisions that Action 2 depends on, especially `OCI_CLI_AUTH=security_token`, credential file behavior, masking assumptions, and Phase 3 smoke-test boundaries.

### Source PRD and Research
- `PRD-composite-actions.md` §Action 2 — original Action 2 contract for inputs, outputs, and behavior. Treat bash-only implementation language as superseded by this context.
- `.planning/research/STACK.md` — verified OCI CLI/package versions, Action 2 prior bash-only recommendation now superseded, and current stack references.
- `.planning/research/FEATURES.md` — `run-oci-cli-command` feature tradeoffs: `query`, `silent`, redaction, install behavior, upstream comparison.
- `.planning/research/ARCHITECTURE.md` — existing architecture references for Action 2, to be revised for TypeScript.
- `.planning/research/PITFALLS.md` — shell-injection and GitHub Actions pitfalls that still apply.
- `.planning/research/SUMMARY.md` — cross-cutting synthesis; Action 2 bash-only statements are superseded by this context.

### Existing Code and Docs
- `actions/oci-token-exchange/action.yml` — existing composite action style and env/output conventions that Phase 2 interoperates with.
- `.github/workflows/test-actions.yml` — existing Phase 1 CI workflow to extend with path-based Phase 2 npm gates.
- `docs/actions/README.md` — planned Action 2 docs entry to replace with real docs.
- `actions/oci-token-exchange/README.md` — documentation style/pattern for the new Action 2 README.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `actions/oci-token-exchange/action.yml` — demonstrates current action metadata style, defaults, and security posture. Phase 2 should not copy the composite implementation shape, but should preserve naming clarity and consumer-facing quality.
- `.github/workflows/test-actions.yml` — already runs checkout, dependency install, ruff, actionlint, injection-pattern lint, and pytest for Phase 1. Phase 2 extends this workflow with npm gates and path-based conditional behavior.
- `docs/actions/README.md` and `actions/oci-token-exchange/README.md` — provide documentation style and action index structure.

### Established Patterns
- Consumers pin by SHA, not tag. Action behavior, including the OCI CLI floor, is controlled by the pinned action SHA.
- The repo favors fail-closed security and dependency hygiene: current docs already require latest dependency floors, SHA-pinned third-party actions, no shell tracing, and explicit redaction behavior.
- Action 1 registers UPST/client-secret masks. Action 2 should not add blanket masking that harms operator visibility.

### Integration Points
- `actions/run-oci-cli-command/action.yml` will be consumed after `actions/oci-token-exchange`, relying on `OCI_CLI_AUTH=security_token` and OCI config written by Action 1.
- `.github/workflows/test-actions.yml` must keep Phase 1 Python coverage while adding Phase 2 TypeScript coverage and bundle freshness checks.
- Phase 3 will chain Action 1 and Action 2 in a real OCI smoke test and can assert `oci-cli-version`.

</code_context>

<specifics>
## Specific Ideas

- Use `@actions/core` 3.0.1 for inputs, outputs, and failures.
- Use `@actions/exec` 3.0.0 for argv-based `oci` execution and output capture.
- Use `@actions/io` 3.0.2 if path/binary lookup helpers are useful.
- Use `shell-quote` 1.8.3 for parse/quote behavior, while rejecting all non-string parse tokens.
- Use `@vercel/ncc` 0.38.4 for bundling.
- Use Vitest 4.1.5 for tests, including temp PATH shim tests for fake `oci`, fake Python/pip, stdout/stderr capture, and parser edge cases.
- Include docs/tests for realistic OCI JSON/JMESPath examples such as `--from-json '{"key":"value"}'` and `--query "data[0].name"`.

</specifics>

<deferred>
## Deferred Ideas

- Caller-configurable `oci-cli-version-spec` input — rejected for v1 to preserve consistent SHA-pinned behavior.
- Caller-configurable `sentinel-path` input — rejected for v1; sentinel path remains internal.
- `fail-on-error` input — rejected; callers use native `continue-on-error`.
- Extra blanket redaction / OCID masking / caller-supplied mask-values input — rejected for v1 because it can hide useful logs and Action 1 already masks real secrets.
- Structured command inputs replacing `command` — not for v1; current PRD/API remains a command string with safe parsing.
- Real OCI smoke tests — Phase 3 owns real OCI integration once Action 1 and Action 2 are complete and required secrets exist.
- Root npm workspace — defer until another TypeScript action appears.

</deferred>

---

*Phase: 2-OCI CLI Wrapper Action*
*Context gathered: 2026-05-09*
