# OCI IPT Smoke Test

## Purpose

The real OCI smoke test lives in `colour-within-ops` because the current Identity Propagation Trust is pinned to that repository. This workflow proves only the authentication path for a candidate `.github` action SHA. It does not deploy, mutate OCI resources, or expand IPT trust to this repository.

## Workflow location

Create the smoke workflow at:

```text
colour-within-ops/.github/workflows/oci-ipt-smoke.yml
```

## Required workflow properties

- Triggered manually with `workflow_dispatch`.
- Runs against `environment: production`.
- Requests only the permissions needed for GitHub OIDC and source checkout metadata:

```yaml
permissions:
  id-token: write
  contents: read
```

## Workflow skeleton

The verification step uses Python from the GitHub-hosted runner for JSON parsing and numeric semantic-version comparison, so it does not depend on `jq` being present or compare versions lexicographically.

```yaml
name: OCI IPT Smoke

on:
  workflow_dispatch:
    inputs:
      candidate_sha:
        description: ColourWithin/.github commit SHA to smoke-test
        required: true
        type: string

concurrency:
  group: oci-ipt-smoke-${{ inputs.candidate_sha }}
  cancel-in-progress: false

permissions:
  id-token: write
  contents: read

jobs:
  smoke:
    name: OCI IPT auth smoke
    runs-on: ubuntu-24.04
    environment: production

    steps:
      - name: Exchange GitHub OIDC token for OCI UPST
        id: token
        uses: ColourWithin/.github/actions/oci-token-exchange@${{ inputs.candidate_sha }}
        with:
          client-identifier: ${{ secrets.OCI_OIDC_CLIENT_IDENTIFIER }}
          client-secret: ${{ secrets.OCI_OIDC_CLIENT_SECRET }}
          domain-base-url: ${{ vars.OCI_DOMAIN_BASE_URL }}
          audience: https://github.com/ColourWithin/colour-within-ops

      - name: Run read-only OCI smoke command
        id: smoke
        uses: ColourWithin/.github/actions/run-oci-cli-command@${{ inputs.candidate_sha }}
        with:
          command: oci os ns get

      - name: Verify smoke result
        shell: bash
        env:
          CANDIDATE_SHA: ${{ inputs.candidate_sha }}
          EXIT_CODE: ${{ steps.smoke.outputs.exit-code }}
          OCI_CLI_VERSION: ${{ steps.smoke.outputs.oci-cli-version }}
          SMOKE_OUTPUT: ${{ steps.smoke.outputs.output }}
        run: |
          python - <<'PY'
          import json
          import os
          import re
          from pathlib import Path

          def version_tuple(value: str) -> tuple[int, int, int]:
              match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", value.strip())
              if not match:
                  raise SystemExit(f"Invalid oci-cli-version: {value!r}")
              return tuple(int(part) for part in match.groups())

          if os.environ["EXIT_CODE"] != "0":
              raise SystemExit(f"OCI smoke failed with exit-code={os.environ['EXIT_CODE']}")

          payload = json.loads(os.environ["SMOKE_OUTPUT"])
          if not isinstance(payload, dict) or "data" not in payload:
              raise SystemExit("OCI namespace output did not contain a data field")

          observed = version_tuple(os.environ["OCI_CLI_VERSION"])
          minimum = (3, 81, 1)
          if observed < minimum:
              raise SystemExit(
                  f"oci-cli-version {os.environ['OCI_CLI_VERSION']} is below 3.81.1"
              )

          summary = Path(os.environ["GITHUB_STEP_SUMMARY"])
          summary.write_text(
              "\n".join(
                  [
                      "## OCI IPT smoke",
                      "",
                      f"- Candidate SHA: {os.environ['CANDIDATE_SHA']}",
                      "- Command: `oci os ns get`",
                      "- Exit code: 0",
                      f"- OCI CLI version: {os.environ['OCI_CLI_VERSION']}",
                      "- JSON parse result: passed",
                  ]
              )
              + "\n"
          )
          PY
```

## Fallback read command

Use the namespace command first:

```yaml
command: oci os ns get
```

If the ops team needs a more permission-scoped policy proof, use a read-only compartment list with a secret-supplied compartment OCID:

```yaml
command: oci iam compartment list --compartment-id ${{ secrets.OCI_SMOKE_COMPARTMENT_OCID }}
```

Record the fallback reason in the release evidence.

## Evidence to record before v1.0.0 tag

- Candidate SHA
- Workflow run URL
- Workflow path: `colour-within-ops/.github/workflows/oci-ipt-smoke.yml`
- Command
- Exit code
- `oci-cli-version`
- JSON parse result
- Operator/date

## Non-goals

- No deploy steps.
- No mutation commands.
- No IPT trust expansion to `.github`.
- No cross-repo status bridge in v1.0.
