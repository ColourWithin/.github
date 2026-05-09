---
phase: 1
review_cycle: 2
reviewers: [codex]
reviewed_at: 2026-05-09T20:50:54+10:00
plans_reviewed:
  - 01-01-PLAN.md
  - 01-02-PLAN.md
---

# Cross-AI Plan Review - Phase 1, Cycle 2

Cycle 2 was run after review-driven replanning. The prior cycle's HIGH concern around the raw `${{ inputs.* }}` grep is treated as historical context only unless it remains present in the current plan text.

## Codex Review

## Summary

The cycle-2 plans are materially stronger than cycle 1: the previous HIGH concern around the broad `${{ inputs.* }}` grep is resolved by a scope-aware scanner that only inspects literal `run:` bodies. Overall, the phase is well-scoped and likely executable, but I would not call it fully ready yet because there is one current HIGH security gap: the UPST token file is written without an explicit restrictive mode.

## Strengths

- The prior HIGH issue is resolved: legitimate `env:` mappings are preserved, while `${{ inputs.* }}` inside `run:` blocks is still blocked.
- Good phase split: Python/token logic first, then composite action wiring, README, and CI.
- Strong handling of OCI SDK quirks: eager `TokenExchangeSigner` constructor and vendored `oci._vendor.requests` exceptions are correctly called out.
- Good fail-fast UX for missing `id-token: write`, before `pip install`.
- Dependency freshness evidence still checks out: `oci 2.173.1`, `actions/checkout v6.0.2`, and `actionlint v1.7.12` are current from official APIs as of this review.

## Concerns

- **HIGH:** `upst.token` is written with default file permissions. The UPST is a bearer credential, so relying on runner umask is too loose, especially because the README explicitly discusses self-hosted runner persistence. The plan should `chmod 600` the token file, and likely the config file too.
- **MEDIUM:** The test import template will likely fail `ruff E402`: `from exchange import ...` appears after `sys.path.insert(...)` without `# noqa: E402`. `conftest.py` also includes an unused `os` import.
- **MEDIUM:** The workflow says "SHA-pinned actionlint binary download" in validation language, but the actual plan only version-pins the tarball and performs no checksum verification.
- **LOW:** Some negative-grep verification commands are written as if "no output" equals success, but bare `grep` exits 1 when no match is found. Fine for manual checks, brittle if copied into automated scripts.
- **LOW:** Prefer `python -m pip install ...` over bare `pip install ...` for runner clarity.

## Suggestions

- Add explicit permissions after writing credential files: `os.chmod(token_path, 0o600)` and consider `os.chmod(config_path, 0o600)`.
- Add a test for token-file permissions, not only key-file permissions.
- Fix the test import pattern before execution: either use `import exchange  # noqa: E402` only, or add `# noqa: E402` to every post-`sys.path` import.
- Remove unused template imports before committing, especially `os` in `conftest.py`.
- Either verify the actionlint tarball checksum or revise the wording so it accurately says "version-pinned" rather than "SHA-pinned."

## Risk Assessment

**Overall risk: MEDIUM.** The architecture and sequencing are sound, and the prior cycle's HIGH CI-scanner defect is resolved. The remaining blocker is narrower but security-relevant: a UPST file should not be left to default filesystem permissions. Once that is fixed, the residual risks are mostly CI polish and implementation hygiene.

Sources checked:

- PyPI `oci` JSON: https://pypi.org/pypi/oci/json
- `actions/checkout` latest release API: https://api.github.com/repos/actions/checkout/releases/latest
- `rhysd/actionlint` latest release API: https://api.github.com/repos/rhysd/actionlint/releases/latest

---

## Consensus Summary

Only the requested Codex reviewer was invoked in this cycle, so consensus means the synthesized current-action priorities from that review rather than overlap across multiple independent reviewers.

### Agreed Strengths

- The cycle-1 HIGH concern about an over-broad `${{ inputs.* }}` grep is fully resolved in the current Phase 1 plans by a scope-aware run-body scanner.
- The phase split remains sound: Plan 01-01 owns the Python token-exchange logic and tests; Plan 01-02 owns composite wiring, README, and the unit-test workflow.
- The current plans preserve the important security boundaries around OIDC preflight, env-only input transfer, no xtrace, raw OCI 4xx surfacing, vendored OCI exceptions, and dependency freshness.

### Agreed Concerns

- **HIGH:** `upst.token` is a bearer credential but the current plans do not require explicit restrictive permissions on the token file. The plan should require `chmod 600` for `upst.token`, add a test for that permission, and strongly consider the same explicit mode for the generated OCI config file.
- **MEDIUM:** The test template/import guidance may trip ruff (`E402` after `sys.path.insert`, unused imports) unless the execution pass cleans it up.
- **MEDIUM:** The actionlint installation language should be made truthful: the plan version-pins the release tarball, but does not checksum/SHA-verify the downloaded binary.
- **LOW:** Manual negative-grep checks are acceptable for operator verification, but any automated copy should guard expected no-match exits with `! grep ...` or equivalent.

### Divergent Views

- No divergent reviewer views were available because this cycle requested `--codex` only.

### Current HIGH Concerns

- `upst.token` is written without an explicit restrictive file mode; because it is a bearer credential and the README discusses self-hosted runner persistence, relying on the runner umask is not sufficient.

### Resolved Prior HIGH Concerns

- Cycle-1 HIGH: the raw grep for `${{ inputs.* }}` in `action.yml` would have flagged legitimate `env:` mappings. Cycle 2 resolves this with a scope-aware scanner that only inspects literal `run:` block bodies.
