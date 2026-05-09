# Phase 3: Smoke Test, Branch Protection, and v1.0.0 Tag - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 3-Smoke Test, Branch Protection, and v1.0.0 Tag
**Areas discussed:** Smoke assertion target, Secrets and required-check sequencing, SHA-pinned workflow dependencies, Release docs and tag contract, Cross-repo IPT correction

---

## Smoke Assertion Target

| Option | Description | Selected |
|--------|-------------|----------|
| Compartment list | Run `oci iam compartment list --compartment-id <tenancy_ocid>` or similar read-only scoped call. | Initially |
| Vault secret read | More deployment-like permission path, but higher sensitivity. | |
| Object Storage probe | Harmless if a bucket exists, but adds resource dependency. | |
| Object Storage namespace | Run `oci os ns get` with no additional target OCID. | Yes |

**User's choice:** Start with the most harmless read. After ops-team guidance, prefer `oci os ns get`; keep compartment list as fallback if policy-scoped proof is needed.
**Notes:** User noted the OCI user has limited access, so the exact harmless command must be compatible with the Service User policy. The smoke should prove auth, not deploy or mutate anything.

---

## Secrets and Required-Check Sequencing

| Option | Description | Selected |
|--------|-------------|----------|
| Merge workflow, gate smoke job on secrets | Workflow can land before secrets exist; smoke skips clearly until runnable. | Initially |
| Do not merge until secrets exist | Cleaner gate story but blocks on external coordination. | |
| Merge failing smoke job intentionally | Visible but noisy and unsafe to require. | |
| External smoke evidence gate | Real smoke runs in `colour-within-ops`, not this repo. | Yes |

**User's choice:** Corrected to external smoke evidence gate after identifying the IPT trust boundary.
**Notes:** The current IPT is pinned to `colour-within-ops`, so this repo cannot truthfully self-smoke token exchange against OCI. Branch protection here should require only local checks this repo can run honestly.

---

## SHA-Pinned Workflow Dependencies

| Option | Description | Selected |
|--------|-------------|----------|
| All third-party actions pinned to full commit SHA | Full SHA pins with readable version comments. | Yes |
| Major-version tags allowed | Easier maintenance but conflicts with project requirements. | |
| Only security-sensitive actions pinned | Flexible but ambiguous. | |

**User's choice:** Full SHA pins for third-party actions.
**Notes:** Actionlint downloads should also be version-pinned and SHA256 checksum-verified. Planner/executor should re-check latest versions at execution time before pinning.

---

## Self-Reference Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Use `@${{ github.sha }}` self-reference | Proves the candidate commit through consumer-style `uses:` path. | Yes |
| Use local relative paths | Simpler but less faithful to consumer usage. | |
| Use both | More coverage but redundant. | |

**User's choice:** Use candidate `.github` commit SHA.
**Notes:** After the IPT correction, this applies to the external `colour-within-ops` smoke workflow using `ColourWithin/.github/actions/...@<candidate-sha>`.

---

## Release Docs and Tag Contract

| Option | Description | Selected |
|--------|-------------|----------|
| Top-level README plus docs/actions index | Minimal top-level release/consumption note plus one-click detailed docs. | Yes |
| Top-level README only | Easy to find but bloats the org-health README. | |
| Action docs only | Cleaner internals but weaker top-level release signal. | |

**User's choice:** Top-level README plus detailed docs under `docs/actions/*`.
**Notes:** User preferred a minimal README because the repo is internal and detailed docs are one click away.

---

## Tag Gate

| Option | Description | Selected |
|--------|-------------|----------|
| Manual tag after both gates | Verify local checks and external smoke evidence, then ask/stop for final approval before tagging. | Yes |
| Automatic tag after both gates | More autonomous but needs more automation and touches external release state. | |
| No tag until ops consumes it | Conservative but leaves Phase 3 incomplete. | |

**User's choice:** Manual tag after both local checks and external smoke evidence.
**Notes:** Tagging is externally visible and should not happen automatically in v1.0.

---

## Cross-Repo IPT Correction

| Option | Description | Selected |
|--------|-------------|----------|
| External smoke evidence gate | `colour-within-ops` runs the real smoke using the candidate SHA. | Yes |
| Expand IPT to trust this repo too | Lets `.github` self-smoke but widens OCI trust just for testing. | |
| Split gates | Local `.github` checks plus separate consumer gate, without making it the release evidence. | |

**User's choice:** External smoke evidence gate.
**Notes:** Ops team guidance: smoke test should live in `colour-within-ops` at `.github/workflows/oci-ipt-smoke.yml`, run with `environment: production`, request OIDC audience `https://github.com/ColourWithin/colour-within-ops`, use the finished token-exchange action, run a harmless OCI read command, and fail loudly if token exchange or OCI auth fails.

## the agent's Discretion

- Exact local release-readiness workflow shape.
- Exact wording of minimal README release note.
- Exact format for recording external smoke evidence, as long as it includes candidate SHA and workflow run URL/result.

## Deferred Ideas

- Expand IPT to trust `.github`.
- Build a cross-repo status/check reporting bridge.
- Automatic release tagging.
- Mutable OCI smoke probes.
