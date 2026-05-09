# OCI Token Exchange Action

Use `ColourWithin/.github/actions/oci-token-exchange` when a workflow needs short-lived OCI authentication through GitHub Actions OIDC and OCI Identity Propagation Trust (IPT).

The action exchanges the job's GitHub OIDC ID token for an OCI User Principal Session Token (UPST), writes OCI CLI security-token config to disk, and exports `OCI_CLI_AUTH=security_token` for later steps in the same job.

## When to use it

Use this action before steps that call `oci` directly or before tooling that reads standard OCI CLI config from disk.

This action is the replacement for third-party OCI token-exchange actions that are not maintained or do not produce the desired principal classification.

## Prerequisites

- OCI Identity Propagation Trust configured to trust `https://token.actions.githubusercontent.com`.
- The IPT `allowedTokenAudiences` includes `https://github.com/ColourWithin`, unless you override the action's `audience` input.
- OCI Confidential Application OAuth credentials for token exchange.
- The target Service User is mapped by the IPT policy.
- The consuming repo has these GitHub values:
  - Secret: `OCI_OIDC_CLIENT_IDENTIFIER`
  - Secret: `OCI_OIDC_CLIENT_SECRET`
  - Variable: `OCI_DOMAIN_BASE_URL`

## Required workflow permissions

Every job that calls this action must grant GitHub OIDC token access:

```yaml
permissions:
  id-token: write
  contents: read
```

If `id-token: write` is missing, the action fails before installing Python dependencies and prints the required permissions block.

## Basic usage

Pin consumption to a commit SHA or release tag. The doubled `.github` path is intentional: this repo is the organisation default repository, and actions live below its `actions/` directory.

```yaml
jobs:
  deploy:
    runs-on: ubuntu-24.04
    permissions:
      id-token: write
      contents: read

    steps:
      - name: Exchange OIDC token for OCI UPST
        uses: ColourWithin/.github/actions/oci-token-exchange@<commit-sha>
        with:
          client-identifier: ${{ secrets.OCI_OIDC_CLIENT_IDENTIFIER }}
          client-secret: ${{ secrets.OCI_OIDC_CLIENT_SECRET }}
          domain-base-url: ${{ vars.OCI_DOMAIN_BASE_URL }}

      - name: Run OCI CLI
        run: oci iam region list
```

## Inputs

| Input | Required | Default | Notes |
|-------|----------|---------|-------|
| `client-identifier` | yes | - | OAuth client ID for the OCI Confidential Application. Use `secrets.OCI_OIDC_CLIENT_IDENTIFIER`. |
| `client-secret` | yes | - | OAuth client secret for the OCI Confidential Application. Use `secrets.OCI_OIDC_CLIENT_SECRET`. |
| `domain-base-url` | yes | - | OCI Identity Domain base URL. Use `vars.OCI_DOMAIN_BASE_URL`. |
| `audience` | no | `https://github.com/ColourWithin` | Must match an audience allowed by the IPT. |
| `region` | no | `ap-sydney-1` | OCI region written into the generated CLI config. |
| `output-config-path` | no | `${{ runner.home }}/.oci/config` | Destination for generated OCI CLI config. |
| `output-key-path` | no | `${{ runner.home }}/.oci/upst.pem` | Destination for the ephemeral private key PEM. |

## Outputs

| Output | Description |
|--------|-------------|
| `config-path` | Absolute path to the generated OCI CLI config file. |
| `expires-at` | ISO 8601 expiry timestamp for the UPST. |

## Files written

With default paths, the action writes:

- `~/.oci/config` - OCI CLI `[DEFAULT]` profile using security-token authentication.
- `~/.oci/upst.token` - UPST bearer token text, written with `chmod 600`.
- `~/.oci/upst.pem` - Ephemeral RSA private key, written with `chmod 600`.

The action also appends `OCI_CLI_AUTH=security_token` to `$GITHUB_ENV`, so subsequent steps in the same job automatically use security-token auth.

## Token lifetime

Each exchange produces a UPST with a roughly 60-minute lifetime. The OCI CLI does not refresh session tokens during execution. For jobs that can run longer than about 55 minutes, call this action again between long phases.

## Common failures

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| The action fails immediately and prints a permissions block | Missing GitHub OIDC permission | Add `permissions: id-token: write` to the job. |
| OCI token exchange returns a 4xx error | IPT, audience, client credentials, or Service User mapping is wrong | Check `allowedTokenAudiences`, domain URL, OAuth credentials, and IPT policy. |
| Later `oci` commands cannot find credentials | A later step overrides OCI env/config paths | Use the action's `config-path` output or keep default OCI CLI config discovery. |
| Long-running job loses OCI access | UPST expired | Re-run this action before the long-running phase continues. |

## Self-hosted runners

GitHub composite actions do not have a `post:` cleanup hook. On self-hosted runners, the generated `~/.oci/config`, `~/.oci/upst.token`, and `~/.oci/upst.pem` files remain on disk until the runner environment is cleaned up. GitHub-hosted runners are ephemeral and discard the VM after the job.

## Implementation reference

The action source lives in:

- `actions/oci-token-exchange/action.yml`
- `actions/oci-token-exchange/exchange.py`
- `actions/oci-token-exchange/README.md`
