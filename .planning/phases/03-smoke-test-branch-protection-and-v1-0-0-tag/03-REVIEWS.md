---
phase: 3
reviewers: [gemini, claude]
reviewed_at: 2026-05-10T00:24:39+10:00
plans_reviewed:
  - 03-01-PLAN.md
  - 03-02-PLAN.md
  - 03-03-PLAN.md
  - 03-04-PLAN.md
cycles: 2
convergence_status: converged
current_high_concerns: 0
---

# Cross-AI Plan Review - Phase 3

## Gemini Review

# Cross-AI Plan Review: Phase 3 (Smoke Test, Branch Protection, and v1.0.0 Tag)

## 1. Summary

This is an excellent, highly rigorous set of plans that correctly navigates the cross-repo trust boundary. The plans recognize that the `.github` repo cannot self-smoke against OCI without violating the Identity Propagation Trust (IPT) boundary, and appropriately shifts the real OCI verification to a documented, manual gate executed in `colour-within-ops`. The sequence logical breaks down into local deterministic hardening (03-01), external handoff documentation (03-02), and a strict manual release/tagging checkpoint (03-03).

## 2. Strengths

- **Trust Boundary Recognition:** Correctly supersedes the original, flawed assumption that the `.github` repo could perform the OCI smoke test itself.
- **Supply-Chain Hygiene:** Plan 03-01 aggressively targets supply-chain risks by pinning third-party actions, verifying the `actionlint` tarball checksum, and establishing local lint rules to prevent regressions.
- **Auditable Release Evidence:** Plan 03-03 introduces `03-EXTERNAL-SMOKE-EVIDENCE.md`, providing a concrete, checklist-driven mechanism to record the external ops workflow result. This is a practical, effective bridge for the cross-repo boundary in v1.0 without over-engineering automated status checks.
- **Human-in-the-loop Tagging:** Setting `autonomous: false` and explicitly halting the executor in Plan 03-03 before the `git tag` command ensures the externally visible release marker is not created prematurely.

## 3. Concerns

- **[LOW] Version Extraction Flakiness (Plan 03-01):** Task 1 relies on `python -m pip index versions oci | head -1` to grab the latest SDK version. Depending on the pip version and PyPI state, this might occasionally surface a pre-release/release candidate.
- **[LOW] Tag Pinning Lint Check (Plan 03-01):** Task 3 requests a custom static check to forbid tag-pinned `uses:` refs. Writing reliable YAML AST parsers in inline Python/Bash can be brittle if workflow formatting varies.

## 4. Suggestions

- **Plan 03-01, Task 1:** Add a minor instruction for the executor to verify the output of the pip version commands looks like a stable semantic version (for example, avoiding `rc` or `b` suffixes) before committing to it.
- **Plan 03-01, Task 3:** For the custom static check against tag-pinned actions, advise the executor to keep the `grep`/`python` script simple by checking lines that match `uses:` and validating they end in a 40-character hex string.

## 5. Risk Assessment

**LOW RISK.** The plans are exceptionally secure and defensive. By removing the false self-smoke and replacing it with an explicit evidence hand-off, the plans protect the OCI trust boundary while still fulfilling all underlying v1.0 release requirements. The plans are ready for execution.

---

## Claude Review

# Phase 3 Plan Review

## Plan 03-01: Local Release-Readiness Workflow + Requirements/Roadmap Correction

### Summary

Solid, tightly scoped plan that correctly inverts the broken assumption that this repo cannot self-smoke OCI and replaces it with truthful local gates plus SHA-pin/checksum hygiene. Tasks are concrete, acceptance criteria are greppable, and the threat model maps cleanly to the workflow changes.

### Strengths

- Task 1 forces a re-check of dependency floors before pinning.
- Acceptance criteria are mostly machine-verifiable.
- Static check forbidding both `oci-token-exchange` and `OCI_OIDC_CLIENT_IDENTIFIER` in the local workflow is a durable guardrail against regression to fake self-smoke.
- Pip cache keyed on `requirements.txt` aligns with SMOKE-06.

### Concerns

- **[MEDIUM] No `requirements.txt` on disk.** If `actions/oci-token-exchange/requirements.txt` does not exist, `hashFiles(...)` returns empty and the cache key is degenerate. Plan should either create it or include `pyproject.toml` in the hash input.
- **[MEDIUM] SHA-pin static check is under-specified.** It needs a precise allowlist regex. A naive grep risks false positives or false negatives.
- **[LOW] Job-level permissions already exist.** Note as confirmed rather than action.
- **[LOW] Roadmap negative assertion is subjective.** Replace with positive assertions.
- **[LOW] No `set -euo pipefail` mentioned for new run blocks.**

### Suggestions

- Add an explicit task to verify/create `actions/oci-token-exchange/requirements.txt` if needed, or change cache key to include both `pyproject.toml` and `requirements.txt`.
- Specify the SHA-pin regex literally.
- Consider adding pip cache `restore-keys`.

### Risk Assessment

**LOW-MEDIUM.** Plan achieves its goal cleanly; the cache-key issue is a correctness bug, not a release blocker.

## Plan 03-02: External Smoke Handoff Documentation

### Summary

Documentation-only plan that produces a concrete enough workflow skeleton for the ops team to drop in. Decision coverage is comprehensive; acceptance criteria mostly check for required substrings, which is appropriate for docs.

### Strengths

- Workflow skeleton is fully specified.
- Task 3's negative assertions lock down the non-goals durably.
- Cross-links from action READMEs preserve the detailed-docs decision.

### Concerns

- **[MEDIUM] Skeleton should not teach tag-pinned third-party actions.** If the example includes non-local `uses:` lines, they should be SHA-pinned.
- **[MEDIUM] JSON parse method should be prescribed.** Python is more reproducible than assuming `jq`.
- **[LOW] `oci-cli-version >=3.81.1` check needs a real comparison.**
- **[LOW] README link path should be verified.**
- **[LOW] Consider a `concurrency:` group for smoke runs.**

### Suggestions

- Add an acceptance criterion that non-local `uses:` lines in the skeleton are full-SHA pinned.
- Prescribe Python for JSON validation.
- Mention `concurrency.group: oci-ipt-smoke-${{ inputs.candidate_sha }}`.

### Risk Assessment

**LOW.** Docs-only; worst case is the ops team has to ask one clarifying question.

## Plan 03-03: Top-level README + External Smoke Evidence + Tag Gate

### Summary

The release-gate plan has the right human checkpoint structure. The evidence file is the durable artifact that justifies the manual tag.

### Strengths

- Hard checkpoint before `git tag`.
- Pre-tag duplicate checks cover local and remote tag state.
- Evidence file template is structured enough to audit.
- README scope is genuinely minimal.

### Concerns

- **[HIGH] Tag may be created before external smoke evidence is collected, due to plan ordering.** Plan 03-03 conflates preparing tag artifacts with executing the tag. The natural sequence is: merge release branch, capture main HEAD SHA, run ops smoke against that SHA, then tag. The plan should split tag execution into a separate manual plan or make the post-merge ordering structural.
- **[MEDIUM] Branch protection task assumes admin permissions.** Add a fallback path that produces exact `gh api` payload or UI instructions when the token lacks admin scope.
- **[MEDIUM] Signed-tag fallback is too weak.** The plan should not offer an unsigned fallback; it should hard-fail and surface GPG misconfiguration.
- **[LOW] Add `git fetch --tags origin` before tag existence checks.**
- **[LOW] README wording conflates future and present release state.**

### Suggestions

- Split tag execution into its own plan, explicitly executed after the candidate commit lands on `main`.
- Strike the unsigned-tag fallback and require signed tags.
- Add `git fetch --tags origin` to pre-tag verification.
- Add an acceptance criterion that the evidence file's candidate SHA equals `git rev-parse HEAD` at tag time.

### Risk Assessment

**MEDIUM.** The wave/SHA ordering ambiguity is the most likely failure mode. Manual checkpoint helps, but the plan should make the ordering structural.

## Cross-Plan Observations

- **[HIGH] Candidate-SHA flow has no single source of truth.** Plans 03-02 and 03-03 both reference `<candidate-sha>`/`candidate_sha`, but neither pins down which commit the ops team smokes, where that SHA is recorded first, and how it is verified equal at tag time. A short release choreography artifact would make this concrete: merge release branch, capture HEAD SHA, fill evidence file, run smoke with that SHA, verify smoke run input matches, tag that SHA.
- **[LOW] No plan touches `.planning/STATE.md`; execute-plan workflow likely handles this.**
- **[LOW] No mention of `CHANGELOG.md`; acceptable if README is the chosen changelog surface.**

## Overall Risk

**MEDIUM.** The plans correctly implement the corrected contract and decision coverage is thorough. The two material risks are the pip cache key if `requirements.txt` is missing, and the implicit candidate-SHA to smoke to tag ordering. Both are fixable with small plan amendments.

---

## Consensus Summary

### Agreed Strengths

- Both reviewers agree the corrected cross-repo trust boundary is handled well: local checks in `.github`, real OCI smoke in `colour-within-ops`.
- Both reviewers agree the manual tag checkpoint is the right shape for an externally visible `v1.0.0` tag.
- Both reviewers agree the supply-chain posture is strong: SHA pins, checksum verification, and explicit local guardrails.

### Agreed Concerns

- The release candidate SHA choreography needs to be clearer. Gemini still rates the plan low risk, while Claude raises this as HIGH because candidate SHA, external smoke evidence, and final tag target can drift unless structurally pinned.
- The SHA-pin lint should be simple and explicit enough that execution does not create brittle parsing logic.

### Divergent Views

- Gemini sees no HIGH concerns and considers the plans ready.
- Claude identifies two HIGH concerns around candidate SHA/tag ordering and recommends plan amendments before execution.

## Current HIGH Concerns

- Candidate SHA flow has no single source of truth: the plans do not yet structurally define the exact release commit that `colour-within-ops` must smoke and that `v1.0.0` must tag.
- Plan 03-03 conflates release-artifact preparation with final tag execution; the plan should split or hard-gate tagging so the candidate commit lands on `main`, external smoke verifies that exact SHA, and only then is the tag created.

---

# Cross-AI Plan Review - Phase 3 - Convergence Cycle 2

## Gemini Review

# Cross-AI Plan Review - Phase 3 (Convergence Cycle 2)

## 1. Cycle 1 HIGH Concerns Evaluation

- **Candidate SHA flow had no single source of truth:** **FULLY RESOLVED**. Plan 03-03 introduces `03-RELEASE-DANCE.md` which explicitly defines the sequence and strict equality checks (`git rev-parse origin/main` == evidence candidate SHA == tag target). This provides a concrete, auditable source of truth.
- **Plan 03-03 conflates release-artifact preparation with final tag execution:** **FULLY RESOLVED**. The final tag execution has been cleanly extracted into a new manual plan (`03-04-PLAN.md`). This structurally enforces that the release branch must merge to `main`, the external smoke must run against that exact `origin/main` SHA, and only then is the tag created.

## 2. Current Concerns

- **[LOW] `uses:` syntax space typo in Plan 03-01 Task 3:** The task instruction asks to create a static check that requires "the ref after ` @` to match exactly `[0-9a-f]{40}`". It includes a literal space before the `@`. GitHub Actions syntax does not use a space before the `@` (e.g., `uses: actions/checkout@<sha>`). The executor should be instructed to check for `@` without the preceding space to ensure the regex isn't brittle or incorrect.
- **[LOW] README and Markdown ` @<sha>` references:** Similarly, Plan 03-03 Task 1 instructs updating the README with `ColourWithin/.github/actions/oci-token-exchange @<sha>`. While acceptable for Markdown readability, the executor should be mindful not to propagate this space into actual YAML snippets where it would cause syntax errors.

All previous Cycle 1 MEDIUM and LOW concerns were marked cleanly addressed.

## 3. Overall Risk

**LOW RISK.**

The plans are approved and ready for execution.

## Claude Review

# Phase 3 Plan Review - Cycle 2

## Resolution of Cycle 1 HIGH Concerns

**Both Cycle 1 HIGH concerns are FULLY RESOLVED.**

1. **Candidate SHA single source of truth** - Resolved. New `03-RELEASE-DANCE.md` (Plan 03-03 Task 2) is explicitly named the single source of truth, defines the sequence (merge -> `git rev-parse origin/main` -> ops smoke with that SHA -> evidence -> tag), and enumerates three equality checks. `03-EXTERNAL-SMOKE-EVIDENCE.md` and Plan 03-04 Task 1 both reference `git rev-parse origin/main` as the authoritative value.

2. **Tag execution split from artifact prep** - Resolved. Plan 03-03 contains zero `git tag` commands and explicitly states "This plan does not create the tag." Plan 03-04 is a new wave-3, `autonomous: false` plan that owns final tag creation, with hard equality checks against the smoke-tested SHA, a no-unsigned-fallback rule, and an explicit user-approval checkpoint before `git tag -s -a`.

## Current Concerns

### MEDIUM

- **Plan 03-04 Task 3 - `git tag` target argument.** `$CANDIDATE_SHA` was captured in Task 1 and might not persist to Task 3. The plan should re-derive `CANDIDATE_SHA=$(git rev-parse origin/main)` immediately before the tag command.
- **Plan 03-04 Task 3 - sign-only flag.** Add `git tag -v v1.0.0` after creation and before push to confirm the signature verifies.

### LOW

- Minor markdown/grep literal consistency issues in `03-RELEASE-DANCE.md` and `03-EXTERNAL-SMOKE-EVIDENCE.md`.
- Pre-release filtering in Plan 03-01 is documented but not directly acceptance-gated.
- Reorder final tag verification so `git rev-list -n 1 v1.0.0` equality is checked before pushing the tag.

## Overall Risk

**LOW.**

Cycle 1's two HIGHs are resolved structurally, not just narratively. Plans are ready for execution after the two MEDIUM fixes in Plan 03-04 Task 3.

## Convergence Summary

### Current HIGH Concerns

None.

### Follow-up Plan Corrections Applied

- Plan 03-04 Task 3 now re-fetches and re-derives `CANDIDATE_SHA=$(git rev-parse origin/main)` immediately before signed tag creation.
- Plan 03-04 Task 3 now checks `git rev-list -n 1 v1.0.0` equals `$CANDIDATE_SHA` before pushing.
- Plan 03-04 Task 3 now runs `git tag -v v1.0.0` before pushing and forbids pushing an unverifiable tag.

### Result

CYCLE_SUMMARY current_high=0 previous_high=2 status=converged
