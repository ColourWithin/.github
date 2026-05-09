---
phase: 1
review_cycle: 3
reviewers: [codex]
reviewed_at: 2026-05-09T20:58:54+10:00
plans_reviewed:
  - 01-01-PLAN.md
  - 01-02-PLAN.md
---

# Cross-AI Plan Review - Phase 1, Cycle 3

Cycle 3 was run after token-file-permission replanning. Prior-cycle HIGH concerns are treated as historical unless they remain unresolved in the current plan text.

Latest dependency evidence checked before review:

- PyPI `oci`: 2.173.1
- `actions/checkout`: v6.0.2
- `actions/cache`: v5.0.5
- `rhysd/actionlint`: v1.7.12

## Codex Review

## Summary

Cycle 3 looks ready to execute. The prior HIGH token-file-permission concern is fully resolved in the current plan text: `upst.token` is explicitly written with `chmod 600`, the private key remains `chmod 600`, the generated OCI config is also restricted to `chmod 600`, and the test suite is required to cover token-file permissions. The plan quality is strong overall: it is specific, traceable to TOKEX requirements and decisions, and it correctly handles the OCI SDK's eager constructor and vendored `requests` exceptions.

## Strengths

- Clear security closure: UPST bearer credential, private key, and OCI config now all get explicit restrictive permissions.
- Good SDK fidelity: the plan correctly wraps `TokenExchangeSigner(...)` construction, catches `oci._vendor.requests` exceptions, and avoids inventing a parallel token-exchange implementation.
- Strong injection discipline: inputs are mapped through `env:` and the CI scanner only checks literal `run:` bodies, avoiding the earlier false-positive problem.
- Good fail-fast UX: missing OIDC permission is detected before dependency install and prints the exact YAML fix.
- Scope is well contained: Phase 1 owns token exchange, README, unit tests, and lint only; OCI smoke testing and release/tag work stay deferred.
- README requirements are unusually concrete and should prevent the common audience, UPST lifetime, doubled `.github` path, and self-hosted-runner misunderstandings.

## Concerns

- **MEDIUM:** `pip install --user 'oci>=2.173.1,<3' requests cryptography` in `action.yml` does not use `python -m pip`. This usually works on GitHub-hosted runners, but `python -m pip` is more deterministic and avoids PATH/interpreter ambiguity.
- **MEDIUM:** The actionlint install is version-pinned but not integrity-verified. This is acceptable if the project intentionally accepts GitHub release tarball trust for Phase 1, but the plan should avoid implying it is SHA-verified.
- **LOW:** The retry loop uses `DELAYS = [0.5, 1.0, 2.0, 4.0]` with `MAX_ATTEMPTS = 4`, but only the first three delays are slept. That is logically fine, but the fourth value is misleading.
- **LOW:** `token_path.write_text(upst)` uses default encoding. Fine in practice for JWT text, but `encoding="utf-8"` would make the file contract explicit.
- **LOW:** The README says the replaced action produced `principal.type = 'user' rather than 'workload'`, while this phase explicitly defers runtime workload-claim assertion. That is okay as motivation, but README wording should avoid implying this action proves the claim before TOKEX-V2-01 ships.

## Suggestions

- Change action install commands to `python -m pip install --user ...` in `action.yml` and `python -m pip install ...` in CI.
- Either add checksum verification for the actionlint tarball or consistently describe it as "version-pinned actionlint install," not SHA-pinned.
- Replace `DELAYS = [0.5, 1.0, 2.0, 4.0]` with `DELAYS = [0.5, 1.0, 2.0]`, or rename/comment it so the unused final value is not confusing.
- Write credential text files with explicit encoding, e.g. `token_path.write_text(upst, encoding="utf-8")`.
- In README, phrase the principal-type point as "designed to support the Service User/IPT path; runtime workload assertion is planned for v1.1" unless the implementation actually validates it now.

## Risk Assessment

**Overall risk: LOW to MEDIUM.** The current plans achieve the Phase 1 goal and directly resolve the previous HIGH token-permission issue. Remaining risks are mostly execution polish and supply-chain hardening around auxiliary CI tooling, not core architecture blockers. The plan is specific enough that a competent execution pass should produce the intended action with meaningful unit coverage.

---

## Consensus Summary

Only the requested Codex reviewer was invoked in this cycle, so consensus means the synthesized current-action priorities from that review rather than overlap across multiple independent reviewers.

### Agreed Strengths

- The prior HIGH token-file-permission concern is fully resolved in the current plans by explicit `chmod 600` handling for `upst.token`, retained `chmod 600` handling for `upst.pem`, and token-file permission test coverage.
- The Phase 1 plan remains tightly scoped to token exchange, README, unit tests, and linting, with real OCI smoke testing and release gates deferred to later phases.
- The plans preserve the important security controls around env-only input transfer, OIDC preflight, no `set -x`, vendored OCI exception handling, and no 4xx retries.

### Agreed Concerns

- **MEDIUM:** Prefer `python -m pip` over bare `pip` in the action and CI install commands for interpreter determinism.
- **MEDIUM:** The actionlint installation is version-pinned but not checksum/SHA verified; either add integrity verification or keep the wording truthful as version-pinned only.
- **LOW:** The retry delay constant includes an unused final `4.0` value under the current loop structure.
- **LOW:** Credential text writes should use explicit UTF-8 encoding.
- **LOW:** README motivation around the upstream wrong-principal defect should not imply this phase performs runtime workload-claim verification, which is deferred to v1.1.

### Divergent Views

- No divergent reviewer views were available because this cycle requested `--codex` only.

### Current HIGH Concerns

None.

### Resolved Prior HIGH Concerns

- Cycle-1 HIGH: the raw grep for `${{ inputs.* }}` in `action.yml` would have flagged legitimate `env:` mappings. Cycle 2 resolved this with a scope-aware scanner that only inspects literal `run:` block bodies.
- Cycle-2 HIGH: `upst.token` was written without explicit restrictive file permissions. Cycle 3 resolves this with explicit `chmod 600` handling for the token file, retained restrictive private-key handling, restrictive config-file handling, and token-file permission test coverage.
