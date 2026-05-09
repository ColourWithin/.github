# OCI Token Exchange

## What this action does

This action exchanges a GitHub Actions OIDC ID token for an OCI User Principal Session Token (UPST) via Oracle's `oci.auth.signers.TokenExchangeSigner` using Option A: a composite action plus a small Python runtime. It writes OCI CLI config to disk and exports `OCI_CLI_AUTH=security_token` for subsequent steps in the same job. It replaces `gtrevorrow/oci-token-exchange-action`, which ships unpatched `axios < 1.12.0` (CVE-2025-58754) and produces a UPST with `principal.type = 'user'` rather than `'workload'`.

## Prerequisites

- OCI Identity Propagation Trust (IPT) configured to trust `https://token.actions.githubusercontent.com`.
- OCI Confidential Application with OAuth client credentials.
- Service User mapped via IPT policy.
- `OCI_OIDC_CLIENT_IDENTIFIER` populated in the consuming repo's GitHub Secrets.
- `OCI_OIDC_CLIENT_SECRET` populated in the consuming repo's GitHub Secrets.
- `OCI_DOMAIN_BASE_URL` populated in the consuming repo's GitHub Variables.

IPT and Service User infrastructure are built via Tofu in `colour-within-ops/deploy/tofu/modules/identity/`.

## Required consumer permissions

```yaml
permissions:
  id-token: write
  contents: read
```

Without `id-token: write`, GitHub cannot mint an OIDC token for the job. The action fails immediately with an actionable error message that names this exact permissions block.

## Inputs

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `client-identifier` | yes | - | OAuth client_id from `secrets.OCI_OIDC_CLIENT_IDENTIFIER` |
| `client-secret` | yes | - | OAuth client_secret from `secrets.OCI_OIDC_CLIENT_SECRET` |
| `domain-base-url` | yes | - | Identity Domain base URL |
| `audience` | no | `https://github.com/ColourWithin` | OIDC audience |
| `region` | no | `ap-sydney-1` | OCI region |
| `output-config-path` | no | `~/.oci/config` | Path for OCI CLI config |
| `output-key-path` | no | `~/.oci/upst.pem` | Path for ephemeral RSA private key |

## Outputs

| Name | Description |
|------|-------------|
| `config-path` | Absolute path to written OCI CLI config |
| `expires-at` | ISO 8601 UPST expiry timestamp |

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
        # Note: the doubled .github/ path is required by GitHub's org-default-repo rule.
        uses: ColourWithin/.github/actions/oci-token-exchange@<sha>
        with:
          client-identifier: ${{ secrets.OCI_OIDC_CLIENT_IDENTIFIER }}
          client-secret: ${{ secrets.OCI_OIDC_CLIENT_SECRET }}
          domain-base-url: ${{ vars.OCI_DOMAIN_BASE_URL }}

      - name: Run OCI CLI command
        run: oci iam region list
        # OCI_CLI_AUTH=security_token is automatically available from the previous step.
```

## Audience mapping

The `audience` input default is `https://github.com/ColourWithin`. This value must be configured in the IPT's `allowedTokenAudiences` field.

Oracle's own SDK example, `workload_identity_federation_signer_example.py`, uses `"github-actions"` as a placeholder. Do not copy that placeholder into production. Use the real audience URL configured on the IPT.

## `requested_token_type` literal correction

The OCI PRD section 3 shows `urn:oci:token-type:upst`, but the canonical OCI literal is `urn:oci:token-type:oci-upst` with the `oci-` infix. The OCI SDK uses the correct literal internally. This note exists so consumers do not get stuck reconciling the PRD typo with Oracle SDK source.

## UPST lifetime ceiling

Each exchange produces a UPST with a roughly 60-minute lifetime. The OCI CLI does not refresh session tokens during execution; see [oracle/oci-cli#998](https://github.com/oracle/oci-cli/issues/998). For jobs that may exceed roughly 55 minutes, re-invoke this action between long phases. Do not assume the UPST will be automatically refreshed.

## Filesystem footprint

The action writes three files to the runner filesystem when using default paths:

- `~/.oci/config` - OCI CLI `[DEFAULT]` profile stanza.
- `~/.oci/upst.token` - UPST JWT text in the same directory as the config; basename is always `upst.token`; chmod 600 because this is a bearer credential.
- `~/.oci/upst.pem` - Ephemeral RSA-2048 private key in PEM form; chmod 600.

`OCI_CLI_AUTH=security_token` is exported to all subsequent steps in the same job automatically.

## Self-hosted runner warning

Composite actions have no `post:` lifecycle hook, which is a GitHub Actions limitation. On self-hosted runners, `~/.oci/config`, `~/.oci/upst.token`, and `~/.oci/upst.pem` persist on disk after the job completes until the runner VM is recycled or the files are manually cleaned up. This is acceptable for GitHub-hosted ephemeral runners because VMs are discarded after each job, but self-hosted runner configurations need their own cleanup policy.
