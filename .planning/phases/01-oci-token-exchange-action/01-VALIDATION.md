---
phase: 1
slug: oci-token-exchange-action
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-09
nyquist_rationale: |
  Plan 01-01 has two atomic tasks. Task 1 creates exchange.py with a syntax-only
  <automated> check; Task 2 creates the pytest suite (17 tests) AND runs it,
  providing immediate behavioural coverage of all functions written in Task 1.
  Tasks 1 and 2 are sequentially atomic — Task 2 always runs immediately after
  Task 1 in the same wave. There is no time window where Task 1's behaviour is
  unverified before merge: the wave's <verify> block runs the full pytest suite.
  Wave 0 (test infrastructure: conftest.py, pyproject.toml, requirements.txt,
  test_exchange.py stubs) is created inside Plan 01-01 Task 2 itself rather than
  as a separate prerequisite plan, so wave_0_complete is satisfied at end of
  wave 1, not before it. This is acceptable because the plan is monolithic and
  the failure mode (Task 1 implementation drifting from Task 2's tests) is
  caught by the wave-level pytest run.
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (latest) |
| **Config file** | `actions/oci-token-exchange/pyproject.toml` — `[tool.pytest.ini_options]` |
| **Quick run command** | `pytest actions/oci-token-exchange/tests/ -x` |
| **Full suite command** | `pytest actions/oci-token-exchange/tests/ -v && ruff check actions/oci-token-exchange/` |
| **Estimated runtime** | ~5 seconds (no network, no OCI calls — all mocks/fakes) |

---

## Sampling Rate

- **After every task commit:** Run `pytest actions/oci-token-exchange/tests/ -x`
- **After every plan wave:** Run `pytest actions/oci-token-exchange/tests/ -v && ruff check actions/oci-token-exchange/`
- **Before `/gsd-verify-work`:** Full suite + ruff + actionlint must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | TOKEX-03 | — | RSA-2048 keypair generated; private key PEM, public key base64-DER-SPKI | unit | `pytest -k test_keygen_produces_rsa2048` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | TOKEX-02 | T-1-01 (OIDC mint) | OIDC token fetched via correct URL + bearer; audience param respected | unit | `pytest -k test_get_jwt_calls_correct_url` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | TOKEX-04, TOKEX-08 | T-1-02 (multiline-mask bug) | Token-type literal `urn:oci:token-type:oci-upst` present in source; UPST `.strip()`'d before `::add-mask::`; client-secret masked on entry | unit + static | `pytest -k 'test_token_type_literal_in_source or test_mask_strips_before_emit or test_mask_calls_add_mask'` | ❌ W0 | ⬜ pending |
| 1-01-04 | 01 | 1 | TOKEX-10, TOKEX-11 | T-1-03 (retry leak) | 4xx surfaces body via `::error::` + exits without retry; 5xx exp-backoff max 3 attempts ~10s | unit | `pytest -k 'test_retry_no_retry_on_4xx or test_retry_retries_on_5xx or test_retry_max_attempts'` | ❌ W0 | ⬜ pending |
| 1-01-05 | 01 | 1 | TOKEX-05 | — | OCI config writes `[DEFAULT]` stanza with `security_token_file` / `key_file` / `region`; key file `chmod 600` | unit | `pytest -k 'test_config_write_default_profile or test_key_file_permissions'` | ❌ W0 | ⬜ pending |
| 1-01-06 | 01 | 1 | TOKEX-06, TOKEX-07 | — | `OCI_CLI_AUTH=security_token` appended to `$GITHUB_ENV`; `config-path` (abs) and `expires-at` (ISO 8601) appended to `$GITHUB_OUTPUT`; multi-key append preserves prior content | unit | `pytest -k 'test_write_env_appends or test_write_output_appends or test_write_output_multiple_keys or test_expires_at_iso8601'` | ❌ W0 | ⬜ pending |
| 1-01-07 | 01 | 1 | TOKEX-13 | — | README documents required permissions, IPT prereqs, audience-mapping note, 60-min ceiling, oci-cli #998 caveat, Option A rationale, `requested_token_type` literal correction | manual | Pre-merge checklist | n/a | ⬜ pending |
| 1-02-01 | 02 | 2 | TOKEX-01, TOKEX-12 | T-1-04 (input injection) | All inputs declared with correct required/default values; `pip install --user 'oci>=2.173.1,<3' requests cryptography` invoked; inputs flow as env vars only | static | `grep -E "required: true\|inputs.*INPUT_" actions/oci-token-exchange/action.yml`; `grep "oci>=2.173.1" actions/oci-token-exchange/action.yml` | ❌ W0 | ⬜ pending |
| 1-02-02 | 02 | 2 | TOKEX-09, TOKEX-14 | T-1-05 (preflight) | Bash preflight checks `ACTIONS_ID_TOKEN_REQUEST_URL`/`_TOKEN` BEFORE pip install; on missing, prints `::error::` with exact YAML fix and exits 1; runs with `bash -e -o pipefail`; no `set -x` | unit + static | `pytest -k test_no_set_x_in_action_yml`; `grep -n "set -x" actions/oci-token-exchange/action.yml` (must be empty) | ❌ W0 | ⬜ pending |
| 1-02-03 | 02 | 2 | SCOPE-01 | — | `.github/workflows/test-actions.yml` exists with `unit-tests` job; ruff + actionlint + pytest steps; SHA-pinned action references | static + run | `actionlint .github/workflows/test-actions.yml`; CI green | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `actions/oci-token-exchange/tests/conftest.py` — shared fixtures (tmp_path-based `$GITHUB_OUTPUT` / `$GITHUB_ENV` files, monkeypatched env vars for OIDC mint inputs, fake `TokenExchangeSigner` factory)
- [ ] `actions/oci-token-exchange/tests/test_exchange.py` — unit test stubs covering all TOKEX-* scenarios mapped above
- [ ] `actions/oci-token-exchange/pyproject.toml` — `[tool.pytest.ini_options]` (testpaths = ["tests"]) + `[tool.ruff]` rule baseline
- [ ] `actions/oci-token-exchange/requirements.txt` — `oci>=2.173.1,<3`, `requests`, `cryptography`
- [ ] `.github/workflows/test-actions.yml` — `unit-tests` job: `actions/checkout` (SHA-pinned), pip install pytest+ruff, actionlint binary download (linux_amd64, SHA-pinned), `pytest`, `ruff check`, `actionlint`, custom grep step for `${{ inputs.* }}` interpolation in action.yml `run:` bodies (composite-action injection guard — actionlint cannot lint composite action.yml files; verified by researcher)
- [ ] `actionlint` SHA-pinned binary download in `unit-tests` job — binary not pre-installed on ubuntu-24.04 runner

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| README quality / completeness | TOKEX-13 | Subjective coverage check | Pre-merge: confirm README has usage example, `permissions:` YAML block, IPT prereqs, audience-mapping note, 60-min UPST ceiling caveat, `oracle/oci-cli#998` reference, Option A rationale, `urn:oci:token-type:oci-upst` literal correction relative to PRD |
| Real-world OIDC → UPST exchange | TOKEX-09 (full path), Phase-3 success criteria | Requires real `id-token: write` + real OCI IPT; can't be unit-tested faithfully | Deferred to Phase 3 smoke test against personal-tenancy IPT (gated on `colour-within-ops` Phase 02 B populating secrets) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (Task 1 of Plan 01-01 has syntax-only verify; behavioural coverage provided by Task 2's pytest run in same wave per nyquist_rationale)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (Plan 01-02 verifies upgraded to run pytest + ruff + injection grep)
- [x] Wave 0 covers all MISSING references (test infrastructure created in Plan 01-01 Task 2)
- [x] No watch-mode flags
- [x] Feedback latency < 5s (pytest suite is fully mocked, no network)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-09 (rationale in frontmatter)
