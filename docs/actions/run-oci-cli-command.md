# Run OCI CLI Command Action

Use `ColourWithin/.github/actions/run-oci-cli-command` when a workflow needs to run an OCI CLI command through the first-party ColourWithin action surface.

The action verifies or installs `oci-cli>=3.81.1`, parses the `command` input into argv, runs `oci` without a shell, and publishes stdout plus exit diagnostics as outputs.

## When to use it

Use this action after `actions/oci-token-exchange` has written OCI CLI security-token config, or after any other trusted step has prepared a valid OCI CLI config.

## Basic usage

```yaml
jobs:
  deploy:
    runs-on: ubuntu-24.04
    permissions:
      id-token: write
      contents: read

    steps:
      - name: Exchange OIDC token for OCI UPST
        uses: ColourWithin/.github/actions/oci-token-exchange@<sha-or-tag>
        with:
          client-identifier: ${{ secrets.OCI_OIDC_CLIENT_IDENTIFIER }}
          client-secret: ${{ secrets.OCI_OIDC_CLIENT_SECRET }}
          domain-base-url: ${{ vars.OCI_DOMAIN_BASE_URL }}

      - name: Run OCI command
        id: oci
        uses: ColourWithin/.github/actions/run-oci-cli-command@<sha-or-tag>
        with:
          command: oci iam region list
```

## Inputs

| Input | Required | Default | Notes |
|-------|----------|---------|-------|
| `command` | yes | - | Must start with the literal `oci`. |
| `silent` | no | `false` | Hides the parsed command summary only. |
| `query` | no | - | Appended as `--query <value>` when the command has no existing `--query`. |
| `working-directory` | no | `${{ github.workspace }}` | Relative paths resolve against `GITHUB_WORKSPACE`. |

## Outputs

| Output | Description |
|--------|-------------|
| `output` | Stdout with surrounding whitespace trimmed. |
| `raw-output` | Stdout exactly as captured. |
| `exit-code` | OCI process exit code. |
| `oci-cli-version` | Bare detected OCI CLI version. |

## Command safety

The action parses the command with `shell-quote`, accepts only string argv tokens, and runs `oci` through `@actions/exec`. It rejects shell operators, redirects, comments, command substitution, environment-assignment prefixes, and non-`oci` commands.

Quoted JSON and JMESPath expressions remain valid argv values:

```yaml
with:
  command: >-
    oci os object put --from-json '{"name":"a;b","nested":"x && y"}'
```

## Query behavior

Either put `--query` in the command:

```yaml
with:
  command: oci iam region list --query "data[0].name"
```

Or use the convenience input:

```yaml
with:
  command: oci iam region list
  query: data[0].name
```

Combining both forms fails before execution.

## Install behavior

The action checks `oci --version` and installs or upgrades with `python -m pip install --user 'oci-cli>=3.81.1'` when needed. It adds the Python user bin directory to PATH and writes an internal version-aware sentinel at `~/.oci-cli-installed`.

## Failure behavior

On a non-zero OCI exit, the action writes all outputs first and then fails the step. Use `continue-on-error` when a workflow intentionally needs to inspect a failed command's output.

The action does not retry OCI service errors or parse OCI error payloads in v1.

## Implementation reference

The action source lives in:

- `actions/run-oci-cli-command/action.yml`
- `actions/run-oci-cli-command/src/`
- `actions/run-oci-cli-command/README.md`
