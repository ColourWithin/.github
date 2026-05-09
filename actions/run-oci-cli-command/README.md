# Run OCI CLI Command

## What this action does

This JavaScript action verifies or installs `oci-cli>=3.81.1`, parses a caller-provided `oci ...` command into argv, executes it without a shell, and exposes stdout plus exit diagnostics as outputs. It is designed to run after `actions/oci-token-exchange`, but it also works with any pre-existing OCI CLI config on the runner.

## Prerequisites

- A previous step has prepared OCI CLI authentication, usually with `ColourWithin/.github/actions/oci-token-exchange`.
- The job has Python available for `python -m pip install --user 'oci-cli>=3.81.1'` when OCI CLI is missing or too old.
- The command starts with the literal `oci`.

## Inputs

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `command` | yes | - | OCI command to execute. Must start with `oci`. |
| `silent` | no | `false` | Hides the parsed command summary when `true`; stdout/stderr still stream. |
| `query` | no | - | Convenience JMESPath query appended as `--query <value>` when the command does not already include `--query`. |
| `working-directory` | no | `${{ github.workspace }}` | Directory where the command should run. Relative paths resolve against `GITHUB_WORKSPACE`. |

## Outputs

| Name | Description |
|------|-------------|
| `output` | Stdout with surrounding whitespace trimmed. |
| `raw-output` | Stdout exactly as captured, including trailing newlines. |
| `exit-code` | OCI CLI process exit code as a string. |
| `oci-cli-version` | Bare detected OCI CLI semantic version, for example `3.81.1`. |

## Usage

```yaml
jobs:
  deploy:
    runs-on: ubuntu-24.04
    permissions:
      id-token: write
      contents: read
    steps:
      - name: Exchange OIDC token for OCI UPST
        uses: ColourWithin/.github/actions/oci-token-exchange@<sha>
        with:
          client-identifier: ${{ secrets.OCI_OIDC_CLIENT_IDENTIFIER }}
          client-secret: ${{ secrets.OCI_OIDC_CLIENT_SECRET }}
          domain-base-url: ${{ vars.OCI_DOMAIN_BASE_URL }}

      - name: List regions
        id: regions
        uses: ColourWithin/.github/actions/run-oci-cli-command@<sha>
        with:
          command: oci iam region list

      - name: Use output
        run: printf '%s\n' '${{ steps.regions.outputs.output }}'
```

## Query examples

Use command-level `--query` when that is clearer:

```yaml
with:
  command: oci iam region list --query "data[0].name"
```

Or use the separate `query` input:

```yaml
with:
  command: oci iam region list
  query: data[0].name
```

Do not combine both forms. The action fails before execution when `query` is set and `command` already contains `--query`.

## JSON examples

Quoted JSON is passed as one argv token, not through a shell:

```yaml
with:
  command: >-
    oci os object put --from-json '{"bucketName":"example","objectName":"a;b"}'
```

Nested JSON strings are supported when they remain one quoted shell word:

```yaml
with:
  command: >-
    oci example update --from-json '{"metadata":{"owner":"ci","note":"x && y"}}'
```

Characters such as `;` or `&&` are allowed inside a quoted JSON/JMESPath string argument. Shell operators, redirects, command substitution, comments, and environment-assignment prefixes outside quoted strings are rejected.

## Parser behavior

The action uses `shell-quote` only as a parser. It accepts plain string tokens, requires the first token to be exactly `oci`, then runs `oci` with an argv array through `@actions/exec`. It does not interpolate the command into a shell body and does not run with `shell: true`.

Rejected examples include:

```text
echo hello
OCI_CONFIG=/tmp/config oci iam region list
oci iam region list; echo hidden
oci iam region list && whoami
oci iam region list > out.txt
oci iam region list $(whoami)
oci iam region list # comment
```

## OCI CLI installation

The action requires `oci-cli>=3.81.1`. It checks the current `oci --version` result and installs or upgrades with:

```bash
python -m pip install --user 'oci-cli>=3.81.1'
```

The Python user bin directory is added to PATH. A version-aware internal sentinel at `~/.oci-cli-installed` avoids repeat installs only when the current `oci` binary still satisfies the required floor. The sentinel is not a public input or stable API.

## Logging and `silent`

With `silent: false`, the action logs the parsed command summary and resolved working directory before execution. With `silent: true`, it hides only the command summary. Lifecycle messages and stdout/stderr still stream so failures remain diagnosable.

The action does not add blanket redaction. The token-exchange action masks UPST and client-secret values. Use `silent: true` when command arguments contain values you do not want echoed as a command summary.

## Non-zero exits

OCI CLI errors are not retried or interpreted in v1. The action always sets `output`, `raw-output`, `exit-code`, and `oci-cli-version` before calling `core.setFailed` on a non-zero OCI exit. Workflows that need to inspect a failing command can use native `continue-on-error`:

```yaml
- name: Probe optional resource
  id: probe
  continue-on-error: true
  uses: ColourWithin/.github/actions/run-oci-cli-command@<sha>
  with:
    command: oci resource-manager stack get --stack-id "${{ vars.STACK_ID }}"
```

## Implementation reference

The action source lives in:

- `actions/run-oci-cli-command/action.yml`
- `actions/run-oci-cli-command/src/`
- `actions/run-oci-cli-command/dist/index.js`
