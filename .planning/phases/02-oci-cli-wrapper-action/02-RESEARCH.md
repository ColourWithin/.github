# Phase 2: OCI CLI Wrapper Action - Research

**Date:** 2026-05-09
**Status:** Complete

## Research Question

What do we need to know to plan `actions/run-oci-cli-command` well?

## Summary

Phase 2 should be planned as a self-contained TypeScript JavaScript action under `actions/run-oci-cli-command/`. This replaces the original bash-only assumption because the locked Phase 2 context requires argv-safe parsing, stdout/stderr capture, deterministic output writing, version-aware OCI CLI install behavior, and tests around edge cases that are brittle in shell.

GitHub's current action metadata documentation supports `runs.using: node24` for JavaScript actions, and Node 20 is being deprecated on Actions runners. Plan the action on `node24`, not `node20`, so the new action starts on the current runner runtime.

The implementation should use the latest currently published package versions checked on 2026-05-09:

| Package | Latest checked | Role |
|---------|----------------|------|
| `@actions/core` | `3.0.1` | inputs, outputs, failures, PATH export |
| `@actions/exec` | `3.0.0` | argv-based command execution with live stdout/stderr listeners |
| `@actions/io` | `3.0.2` | optional binary/path helpers |
| `shell-quote` | `1.8.3` | shell-like command parsing and quoting |
| `@vercel/ncc` | `0.38.4` | committed `dist/index.js` bundle |
| `typescript` | `6.0.3` | compiler |
| `vitest` | `4.1.5` | tests |
| `license-checker-rseidelsohn` | `4.4.2` | dependency license allowlist |
| `oci-cli` | `3.81.1` | Python package floor; latest checked via pip index |

## Relevant Existing Patterns

- `actions/oci-token-exchange/action.yml` maps action inputs through `env:` instead of interpolating user input directly into a shell body. Phase 2 should preserve that injection-prevention posture, but as a JavaScript action this primarily means `command` is read through `@actions/core.getInput()` and executed as parsed argv, never through `shell: true`.
- `.github/workflows/test-actions.yml` already has SHA-pinned checkout, actionlint installation, no-xtrace linting, and a scoped composite run-body interpolation scanner. Phase 2 should extend this workflow with action-aware path filters and npm gates rather than replacing the Phase 1 Python gates.
- Phase 1 summaries establish local verification via latest dependency checks, explicit generated-artifact freshness checks, and a dirty-output failure when generated artifacts drift.
- `docs/actions/README.md` is an action index. Phase 2 should move Run OCI CLI Command from "planned" to available and link a dedicated doc page.
- GitHub's JavaScript action runtime should be `node24` for this new action.

## Implementation Architecture

Recommended package layout:

```text
actions/run-oci-cli-command/
  action.yml
  package.json
  package-lock.json
  tsconfig.json
  src/
    index.ts
    command.ts
    install.ts
    outputs.ts
  tests/
    command.test.ts
    install.test.ts
    index.test.ts
  dist/
    index.js
  README.md
```

Recommended module boundaries:

- `command.ts`: trim and parse `command`, require leading `oci`, reject shell operators/control constructs, append `--query <value>` only when the command does not already contain `--query`, validate `working-directory`, and return `{ executable: "oci", args: string[], cwd: string }`.
- `install.ts`: find current `oci`, parse `oci --version`, compare against `3.81.1`, run `python -m pip install --user 'oci-cli>=3.81.1'` when missing or too old, export the user bin directory to PATH, and write/read a version-aware sentinel.
- `outputs.ts`: centralize `output`, `raw-output`, `exit-code`, and `oci-cli-version` output writes so non-zero exits still publish diagnostics before `core.setFailed()`.
- `index.ts`: wire inputs, lifecycle logging, install check, execution with `@actions/exec.exec("oci", args, { cwd, listeners, ignoreReturnCode: true })`, live stream capture, output writing, and failure behavior.

## Command Parsing Notes

Use `shell-quote.parse(command)` as a parser, not as a shell execution primitive. Accept only plain string tokens. Reject anything else, including operator objects, redirects, comments, command substitutions, glob syntax artifacts, and env-assignment prefixes before `oci`.

Minimum parser test cases:

- `oci iam region list` -> executable `oci`, args `["iam", "region", "list"]`
- ` oci iam region list ` trims outer whitespace
- `oci iam region list --query "data[0].name"` preserves the JMESPath query as one argv token
- `oci foo --from-json '{"key":"value"}'` preserves inline JSON as one argv token
- `oci foo --from-json '{"nested":{"space":"a b"}}'` preserves nested JSON strings
- `echo nope`, empty command, `OCI_CONFIG=x oci iam region list`, `oci iam region list; rm -rf /`, `oci iam region list && whoami`, `oci iam region list || true`, command-separator newline, redirects, comments, substitutions, and non-string parse tokens all fail before execution
- `query` input appends `--query <value>` when the parsed command has no `--query`
- setting both command-level `--query` and separate `query` input fails clearly

## OCI CLI Install Notes

The action should be independently usable after `actions/oci-token-exchange`, so it should install or upgrade `oci-cli>=3.81.1` when needed. The version-aware sentinel should not be treated as a public API. It can live under the runner home, for example `~/.oci-cli-installed`, as long as it records the required floor and current `oci --version` so an old sentinel does not skip a required upgrade.

Test with temporary PATH shims rather than installing real OCI CLI:

- no `oci` binary -> fake Python/pip invoked, user bin exported, sentinel written
- current `oci` version `3.81.1` -> no pip install
- newer `oci` version -> no pip install
- older `oci` version -> `python -m pip install --user 'oci-cli>=3.81.1'`
- sentinel exists but `oci` is missing -> install still runs
- sentinel exists for a lower floor -> install still runs

## CI and Dependency Hygiene

Phase 2 CI should add an npm lane without weakening Phase 1:

- `npm ci` in `actions/run-oci-cli-command`
- `npm test`
- TypeScript check, either `npm run typecheck` or `tsc --noEmit`
- `npm audit --audit-level=high`
- license allowlist check with MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, CC0-1.0, and Unlicense
- `npm run build`
- dirty-dist verification that fails if `actions/run-oci-cli-command/dist/index.js` changes after the build

Dependabot should be configured for the action-local npm package directory:

```yaml
updates:
  - package-ecosystem: npm
    directory: /actions/run-oci-cli-command
    schedule:
      interval: weekly
```

## Documentation Notes

Documentation must be updated in four places:

- `actions/run-oci-cli-command/README.md`: full action contract, usage after `actions/oci-token-exchange`, safe JSON quoting, `query`, `silent`, output semantics, install behavior, `oci-cli-version`, and non-zero exit behavior.
- `docs/actions/run-oci-cli-command.md`: consumer docs page.
- `docs/actions/README.md`: move the action into available actions.
- `.planning/PROJECT.md` and `.planning/REQUIREMENTS.md`: replace stale bash-only Action 2 wording with the TypeScript JavaScript action decision and rationale.

## Validation Architecture

Phase 2 can be validated without real OCI access. Real OCI smoke testing remains Phase 3.

Test infrastructure:

- Vitest for parser, install, output, and orchestration tests.
- Fake `oci`, `python`, and `pip` binaries in temporary directories.
- Mock `@actions/core` output/failure APIs and `@actions/exec` listeners where needed.
- Static scanners for no direct `${{ inputs.command }}` interpolation in shell bodies and no `child_process.exec(..., { shell: true })` / `execSync` shell execution in source.

Automated gates:

- `npm ci`
- `npm test`
- `npm run typecheck`
- `npm audit --audit-level=high`
- `npm run licenses`
- `npm run build`
- `git diff --exit-code -- actions/run-oci-cli-command/dist/index.js`
- existing Phase 1 Python tests and ruff continue to pass
- actionlint continues to pass on `.github/workflows/test-actions.yml`

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| `shell-quote` accepts constructs that are meaningful only in a shell | Reject every non-string token and every operator/control sequence before execution |
| Non-zero OCI exits lose useful stdout | Always set `output`, `raw-output`, `exit-code`, and `oci-cli-version` before failing |
| npm dependency drift or generated `dist` drift | `package-lock.json`, `npm ci`, audit/license gates, ncc dirty-dist check |
| Phase 1 Python CI gets skipped accidentally | Use path-aware conditions or per-action checks that run both suites when shared workflow/tooling changes |
| Sentinel skips necessary upgrades | Store required floor and detected version; verify current binary still satisfies floor |
| Documentation retains obsolete bash-only contract | Include `.planning/REQUIREMENTS.md`, `.planning/PROJECT.md`, action docs, and action README in the implementation plan |

## RESEARCH COMPLETE

Research artifacts are ready for planning.
