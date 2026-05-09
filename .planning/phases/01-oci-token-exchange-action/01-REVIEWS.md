---
phase: 1
reviewers: [codex]
reviewed_at: 2026-05-09T20:40:00+10:00
plans_reviewed:
  - 01-01-PLAN.md
  - 01-02-PLAN.md
---

# Cross-AI Plan Review - Phase 1

## Codex Review

## Summary

The plans are strong overall: they decompose Phase 1 cleanly into Python implementation/tests first, then composite-action wiring/docs/CI. The security model is thoughtful, especially around vendored OCI exceptions, input-to-env isolation, UPST masking, and no mocked OCI integration. I would not execute these plans unchanged, though: there is one likely CI-breaking issue in the `${{ inputs.* }}` grep guard, plus a few consistency and ruff-quality problems that should be tightened before execution.

## Strengths

- Clear dependency ordering: `01-01` builds and tests `exchange.py`; `01-02` wires the composite action around it.
- Good security posture: no inline input interpolation in shell, no xtrace, early OIDC permission failure, 4xx no-retry, UPST `.strip()` before masking.
- Correct dependency floor: PyPI lists `oci 2.173.1` as the latest version, released May 5, 2026, so `oci>=2.173.1,<3` satisfies the latest-dependency constraint.
- Correct current third-party pins: GitHub shows `actions/checkout v6.0.2` as latest, and `rhysd/actionlint` shows `v1.7.12` as latest.
- Excellent research-to-plan traceability, especially the `TokenExchangeSigner` eager-constructor behavior and `oci._vendor.requests` exception class.

## Concerns

- **HIGH:** The CI grep step in `test-actions.yml` will likely fail every run:

  ```bash
  grep -n '\${{[[:space:]]*inputs\.' actions/oci-token-exchange/action.yml
  ```

  This matches the intended `env:` mappings in `action.yml`. The plan says only run-body interpolation is forbidden, but the command does not scope itself to the `run:` block.

- **MEDIUM:** Test counts are inconsistent. `01-01` requires 17 tests, while `01-02` checkpoint text says 15 tests / 14+1. That creates avoidable ambiguity during execution and summary writing.
- **MEDIUM:** The provided `exchange.py` import template includes `base64` but the implementation no longer uses it. The test template also includes imports like `StringIO` that may be unused. With `ruff check` as a gate, these templates can fail as written unless the executor cleans them up.
- **MEDIUM:** `actionlint` download is version-pinned but not integrity-checked. The plan explicitly accepts that risk, which is probably okay for Phase 1, but it sits awkwardly beside the project's SHA-pin supply-chain posture.
- **LOW:** Retry timing language is slightly muddled. `DELAYS = [0.5, 1.0, 2.0, 4.0]` with four attempts sleeps only the first three delays, so total sleep is 3.5s, not close to the stated ~10s ceiling. This is safe, but the contract should be precise.
- **LOW:** Plan `01-01` says `write_config()` should use `token_path.resolve()` and `key_path.resolve()`, but `main()` path resolution and parent-directory creation order is described in a confusing sequence. Resolve paths first, then create parents.

## Suggestions

- Replace the CI interpolation grep with a small script that only scans literal `run:` blocks, or use a conservative YAML-aware check. At minimum, exclude the `env:` block reliably; plain `grep ... action.yml` is too broad.
- Normalize all references to the test count to 17, or change the planned suite to 15. The current mixed count will confuse GSD completion checks.
- Remove unused imports from the templates, or explicitly instruct the executor to let ruff drive final import cleanup before committing.
- Add checksum or GitHub attestation verification for the actionlint tarball if you want the CI workflow to match the repo's supply-chain standard.
- Tighten retry wording: either use delays `[0.5, 1.0, 2.0]` for 4 attempts, or keep `[0.5, 1.0, 2.0, 4.0]` and make `MAX_ATTEMPTS = 5`.

## Risk Assessment

**Overall risk: MEDIUM.** The implementation design is sound and likely achieves the phase goals, but the CI grep bug is a real execution blocker. Fix that before running the phase. After that, remaining risks are mostly polish and consistency issues rather than architecture problems.

Sources checked:

- PyPI `oci`: https://pypi.org/project/oci/
- `actions/checkout` releases: https://github.com/actions/checkout/releases
- `rhysd/actionlint` v1.7.12 release: https://github.com/rhysd/actionlint/releases/tag/v1.7.12

---

## Consensus Summary

Only the requested Codex reviewer was invoked in this cycle, so consensus means the synthesized current-action priorities from that review rather than overlap across multiple independent reviewers.

### Agreed Strengths

- Phase 1 is split in the right order: implement and test the token-exchange script first, then wire the composite action and CI.
- The plan preserves the important security boundaries: env-based input transfer, UPST masking, no xtrace, no mocked OCI integration, and vendored OCI exception handling.
- Dependency freshness was rechecked during review: `oci 2.173.1`, `actions/checkout v6.0.2`, and `actionlint v1.7.12` are current as of this cycle.

### Agreed Concerns

- **HIGH:** The planned raw grep for `${{ inputs.* }}` in `action.yml` is too broad and will flag legitimate `env:` mappings, likely breaking CI unless it is scoped to `run:` content or replaced with a YAML-aware guard.
- **MEDIUM:** Test-count inconsistency across the two plans should be corrected before execution.
- **MEDIUM:** Ruff-sensitive template imports should be cleaned up or explicitly left to the implementation pass.
- **MEDIUM:** The actionlint install path remains version-pinned but not integrity-checked.

### Divergent Views

- No divergent reviewer views were available because this cycle requested `--codex` only.
