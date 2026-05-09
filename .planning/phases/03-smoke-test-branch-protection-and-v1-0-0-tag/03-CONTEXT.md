# Phase 3: Smoke Test, Branch Protection, and v1.0.0 Tag - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase releases the two first-party OCI actions as v1.0.0 with honest gates. The `.github` repo owns local static/unit/release-readiness checks, branch protection for checks that can actually run in this repo, consumer documentation, and the release tag. The real OCI end-to-end smoke test must run from `colour-within-ops`, because the current OCI Identity Propagation Trust is pinned to that repository's GitHub OIDC subject, not to `ColourWithin/.github`.

In scope: update `.github/workflows/test-actions.yml` for local release-readiness gates, require only locally truthful checks in `.github` branch protection, document and coordinate the external `colour-within-ops` smoke workflow, record successful external smoke evidence against the candidate `.github` commit SHA, update top-level and action docs for v1.0.0, and create the `v1.0.0` tag only after local checks and external evidence are verified.

Out of scope: expanding OCI IPT trust to this `.github` repo, deploying anything from the smoke workflow, adding a reporting bridge from `colour-within-ops` back to this repo's commit status, mutable OCI probes, mocked OCI integration tests, or new OCI capabilities beyond proving the auth path.

</domain>

<decisions>
## Implementation Decisions

### Smoke Test Ownership

- **D-01:** The real OCI end-to-end smoke test lives in `colour-within-ops`, not this `.github` repo. The existing roadmap assumption that this repo can self-smoke against OCI is superseded because the current IPT trusts `colour-within-ops`.
- **D-02:** The smoke workflow path in `colour-within-ops` is `.github/workflows/oci-ipt-smoke.yml`.
- **D-03:** The smoke workflow is manually triggered with `workflow_dispatch`; it is release evidence, not an automatic deploy path.
- **D-04:** The smoke workflow runs with `environment: production` and `permissions: { id-token: write, contents: read }`.
- **D-05:** The smoke workflow requests the GitHub OIDC token with audience `https://github.com/ColourWithin/colour-within-ops`.
- **D-06:** The smoke workflow uses the finished candidate actions by SHA: `ColourWithin/.github/actions/oci-token-exchange@<candidate-sha>` followed by `ColourWithin/.github/actions/run-oci-cli-command@<candidate-sha>`.
- **D-07:** The smoke scope proves only the auth path. It must not deploy, mutate infrastructure, write OCI resources, or perform any release side effect.
- **D-08:** The smoke must fail loudly if token exchange fails or OCI authentication fails.

### Smoke Assertion

- **D-09:** First-choice harmless OCI read command is `oci os ns get`, executed via `run-oci-cli-command@<candidate-sha>` after token exchange. This avoids target OCID plumbing while proving OCI auth.
- **D-10:** If `oci os ns get` is not sufficient for the policy path the ops team needs to prove, fall back to a read-only, permission-scoped OCI assertion such as `oci iam compartment list --compartment-id <compartment_ocid>`.
- **D-11:** If the fallback compartment-list assertion is used, the target OCID should come from `secrets.OCI_SMOKE_COMPARTMENT_OCID`, not a repo variable.
- **D-12:** Smoke output should assert exit code `0`, JSON-parseable stdout where applicable, and `oci-cli-version >= 3.81.1`. Do not duplicate every unit-level output contract in the external smoke.

### Local Branch Protection

- **D-13:** Branch protection in this `.github` repo must require only checks that honestly run in this repo: static, unit, packaging, dependency, and release-readiness checks.
- **D-14:** Do not make a local OCI smoke job a required check in this repo unless the IPT trust boundary changes. A skipped or fake self-smoke is not a release gate.
- **D-15:** External `colour-within-ops` smoke evidence is a documented manual gate before tagging, not a native required status check on this repo.
- **D-16:** Do not build a cross-repo reporting bridge in v1.0. It is extra GitHub integration scope and not required for this release.

### Dependency and Pinning Policy

- **D-17:** All third-party `uses:` references in workflow files must be pinned to full commit SHAs with comments naming the human-readable version.
- **D-18:** Tool downloads such as `actionlint` release tarballs must be version-pinned and SHA256 checksum-verified.
- **D-19:** Planner/executor must re-check latest versions at execution time before pinning. Versions checked during discussion on 2026-05-09: `actions/cache` v5.0.5, `actions/checkout` v6.0.2, `actionlint` v1.7.12, `oci` 2.173.1, and `oci-cli` 3.81.1.
- **D-20:** The external smoke must use the candidate `.github` commit SHA, not a tag and not local relative paths.

### Release Documentation

- **D-21:** Release docs live in both the top-level `README.md` and `docs/actions/*`. The top-level README stays minimal because this is internal.
- **D-22:** The top-level README should name the two actions, show or link the SHA-pinned consumption entry point, explain the doubled `.github` path only briefly, and point one click to detailed docs.
- **D-23:** Detailed prerequisites, permissions, audience, secret names, UPST lifetime, OCI CLI refresh limitation, and examples stay in `docs/actions/*` and action READMEs.
- **D-24:** v1.0.0 release notes should state the initial action surface area and known limitations without duplicating the full tutorial.

### Tag Gate

- **D-25:** Tagging `v1.0.0` is manual after both gates pass: local required checks in this repo and recorded successful `colour-within-ops` smoke evidence for the candidate SHA.
- **D-26:** Execution should verify the evidence, then stop for final approval or provide the exact tag command before creating the externally visible tag.
- **D-27:** Do not tag automatically from an unreviewed workflow in v1.0.

### the agent's Discretion

- Exact local release-readiness job shape, as long as it is truthful for this repo and does not pretend to run OCI E2E.
- Exact external-smoke evidence format, as long as it records the `colour-within-ops` workflow run URL, candidate `.github` SHA, command used, and pass/fail result.
- Exact top-level README wording, as long as it remains minimal and links to detailed docs.
- Exact branch-protection application mechanism, as long as required checks are activated only after local checks exist and are passing.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project and Requirements

- `.planning/PROJECT.md` — project core value, active requirements, SHA-pin policy, real-OCI testing stance, and release constraints.
- `.planning/REQUIREMENTS.md` — SMOKE-01..07 and REL-01..04 acceptance criteria; must be interpreted with the corrected cross-repo smoke boundary captured here.
- `.planning/ROADMAP.md` — Phase 3 goal and original smoke-test/branch-protection/tag scope; its self-smoke assumption is superseded by this context.
- `.planning/STATE.md` — current status: Phase 2 shipped; Phase 3 current focus and external dependency note.
- `.planning/phases/01-oci-token-exchange-action/01-CONTEXT.md` — Action 1 decisions: OIDC audience, token exchange, UPST persistence, masking, and no mocked OCI integration.
- `.planning/phases/02-oci-cli-wrapper-action/02-CONTEXT.md` — Action 2 decisions: SHA-pinned candidate consumption, argv execution, output semantics, `oci-cli-version`, and Phase 3 smoke boundary.

### Source Docs and Existing User-Facing Docs

- `PRD-composite-actions.md` — original PRD for the two action contracts; implementation details are superseded where later context says so.
- `README.md` — top-level repo README to update with a minimal internal v1.0.0 release/consumption note.
- `docs/actions/README.md` — action docs index; should remain the one-click path to details.
- `docs/actions/oci-token-exchange.md` — detailed token-exchange consumer docs.
- `docs/actions/run-oci-cli-command.md` — detailed CLI wrapper consumer docs.
- `actions/oci-token-exchange/README.md` — action-specific prerequisites, audience, UPST lifetime, and self-hosted runner caveats.
- `actions/run-oci-cli-command/README.md` — action-specific command, output, install, and failure behavior.

### Workflow and Action Code

- `.github/workflows/test-actions.yml` — current local unit/lint/test workflow to extend for release-readiness checks and dependency pin/checksum hygiene.
- `actions/oci-token-exchange/action.yml` — Action 1 metadata and composite entrypoint used by external smoke.
- `actions/run-oci-cli-command/action.yml` — Action 2 metadata and JavaScript entrypoint used by external smoke.
- `actions/run-oci-cli-command/src/` — wrapper implementation whose outputs and `oci-cli-version` support smoke assertions.

### External Coordination

- `colour-within-ops/.github/workflows/oci-ipt-smoke.yml` — required external smoke workflow to create or update in the consumer repo. It must run with `environment: production`, `permissions: { id-token: write, contents: read }`, audience `https://github.com/ColourWithin/colour-within-ops`, and candidate `.github` action SHAs.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `.github/workflows/test-actions.yml` already runs Python lint/tests, actionlint, no-`set -x` checks, no composite input interpolation checks, npm tests/typecheck/audit/license checks, ncc build, and dirty-dist verification.
- `actions/oci-token-exchange/` is already a complete composite action with Python tests and docs.
- `actions/run-oci-cli-command/` is already a complete TypeScript JavaScript action with source, tests, bundled `dist/index.js`, and docs.
- `docs/actions/README.md` already provides a concise index for detailed action docs.

### Established Patterns

- The repo uses SHA-pinned third-party actions with readable version comments.
- Dependency freshness is a first-class concern; latest versions should be checked before execution.
- Real OCI integration is required for auth proof, but mocked or fake-OCI checks are valid only for local unit/mechanics coverage.
- Generated `dist/index.js` is committed for the JavaScript action and verified fresh in CI.

### Integration Points

- Local `.github` branch protection can require checks from `.github/workflows/test-actions.yml`.
- External auth proof integrates through `colour-within-ops`, which owns the trusted GitHub OIDC subject and production environment.
- Release tagging in this repo depends on both local GitHub checks and recorded external smoke evidence.

</code_context>

<specifics>
## Specific Ideas

- `colour-within-ops` smoke workflow skeleton should be named `.github/workflows/oci-ipt-smoke.yml`.
- First-choice smoke command: `oci os ns get`.
- Fallback command: `oci iam compartment list --compartment-id <secret-supplied-ocid>` if a more policy-scoped proof is needed.
- Required external smoke permissions:

```yaml
permissions:
  id-token: write
  contents: read
```

- Required external smoke environment: `production`.
- Required external smoke audience: `https://github.com/ColourWithin/colour-within-ops`.
- Required external smoke trigger: `workflow_dispatch`.

</specifics>

<deferred>
## Deferred Ideas

- Expanding IPT to trust this `.github` repo — rejected for v1.0; do not widen OCI trust just to support release testing.
- Cross-repo reporting bridge from `colour-within-ops` back to `.github` commit statuses — useful future automation, but extra scope for v1.0.
- Automatic `v1.0.0` tagging after gates pass — rejected for v1.0 because tags are externally visible and external smoke evidence is manual.
- Mutable OCI smoke probes — rejected; smoke proves auth only and must not deploy or mutate resources.

</deferred>

---

*Phase: 3-Smoke Test, Branch Protection, and v1.0.0 Tag*
*Context gathered: 2026-05-09*
