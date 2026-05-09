# Phase 2: Pattern Map

**Phase:** 02 - OCI CLI Wrapper Action
**Status:** Complete

## Files to Create or Modify

| Target | Role | Closest Analog | Pattern to Reuse |
|--------|------|----------------|------------------|
| `actions/run-oci-cli-command/action.yml` | JavaScript action metadata | `actions/oci-token-exchange/action.yml` | Clear input/output descriptions, ColourWithin author, defaults, `runs.using: node24`, no shell interpolation of user command |
| `actions/run-oci-cli-command/src/index.ts` | Action runtime entrypoint | `actions/oci-token-exchange/exchange.py` | Central orchestration with small helper functions and explicit output writes |
| `actions/run-oci-cli-command/src/command.ts` | Parser/validator | `actions/oci-token-exchange/tests/test_exchange.py` | Unit-testable pure helpers with edge-case tests |
| `actions/run-oci-cli-command/src/install.ts` | OCI CLI install/version/sentinel | `actions/oci-token-exchange/action.yml` | Runner-local dependency install, but guarded and version-aware |
| `actions/run-oci-cli-command/src/outputs.ts` | Output writer helpers | `actions/oci-token-exchange/exchange.py` | File/output side effects isolated behind helper APIs |
| `actions/run-oci-cli-command/tests/*.test.ts` | Vitest coverage | `actions/oci-token-exchange/tests/test_exchange.py` | Fake env/filesystem/process boundaries; no real OCI calls |
| `actions/run-oci-cli-command/package.json` | action-local npm package | `actions/oci-token-exchange/pyproject.toml` | Co-located package config; no root workspace yet |
| `actions/run-oci-cli-command/package-lock.json` | exact npm lock | `actions/oci-token-exchange/requirements.txt` | Action-local dependency contract |
| `actions/run-oci-cli-command/dist/index.js` | committed bundle | none in Phase 1 | Generated artifact verified by dirty-dist CI |
| `.github/workflows/test-actions.yml` | CI gates | existing same file | Preserve Phase 1 Python gates and add npm gates |
| `.github/dependabot.yml` | dependency updates | none | Add action-local npm ecosystem entry |
| `actions/run-oci-cli-command/README.md` | action README | `actions/oci-token-exchange/README.md` | Consumer-focused examples, prerequisites, caveats |
| `docs/actions/README.md` | action index | existing same file | Move planned action to available actions |
| `docs/actions/run-oci-cli-command.md` | docs page | `docs/actions/oci-token-exchange.md` | Consumer docs style and doubled `.github` path note |
| `.planning/PROJECT.md` | project truth | existing same file | Update active requirement and key decision from bash-only to TypeScript |
| `.planning/REQUIREMENTS.md` | requirements truth | existing same file | Replace CLIRUN-08 with TypeScript JavaScript action requirement |

## Data Flow

1. Consumer runs `actions/oci-token-exchange`, which writes OCI config and exports `OCI_CLI_AUTH=security_token`.
2. Consumer runs `actions/run-oci-cli-command`.
3. `action.yml` starts `dist/index.js` with `runs.using: node24`.
4. `index.ts` reads inputs with `@actions/core`.
5. `install.ts` verifies `oci --version` and installs/upgrades `oci-cli>=3.81.1` only when required.
6. `command.ts` parses and validates `command`, appends `query` if safe, and resolves `working-directory`.
7. `index.ts` executes `oci` via `@actions/exec` with argv, no shell.
8. `outputs.ts` writes `output`, `raw-output`, `exit-code`, and `oci-cli-version` before any failure is surfaced.

## Code Excerpts to Preserve

Input-to-environment safety in existing composite action:

```yaml
env:
  INPUT_CLIENT_IDENTIFIER: ${{ inputs.client-identifier }}
  INPUT_CLIENT_SECRET: ${{ inputs.client-secret }}
```

Phase 2 uses a JavaScript action, so user input is read by toolkit APIs rather than shell interpolation. The same security rule applies: never embed caller-provided `command` in a shell body.

Existing CI actionlint and run-body scanner should remain in `.github/workflows/test-actions.yml`; Phase 2 extends it with npm gates instead of replacing it.

## PATTERN MAPPING COMPLETE
