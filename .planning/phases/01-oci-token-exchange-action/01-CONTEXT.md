# Phase 1: OCI Token Exchange Action - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the `actions/oci-token-exchange` composite action — a single, self-contained action that exchanges a GitHub Actions OIDC ID token for an OCI User Principal Session Token (UPST) via Identity Propagation Trust, persists the UPST + ephemeral private key in OCI CLI config format on disk, and exports `OCI_CLI_AUTH=security_token` to `$GITHUB_ENV` so subsequent steps in the same job authenticate as the impersonated Service User without further configuration.

In scope: action.yml, exchange.py (mint + keygen + POST + persist + mask + outputs), README, requirements.txt, pytest unit tests for pure-Python helpers, ruff + actionlint CI job (added to test-actions.yml in this phase).

Out of scope: Action 2 implementation (Phase 2), end-to-end OCI smoke test (Phase 3), `v1.0.0` tag (Phase 3), branch protection (Phase 3), `workload` principal-type assertion (deferred to v1.1 per REQUIREMENTS.md TOKEX-V2-01), audience claim validation (TOKEX-V2-02).

</domain>

<decisions>
## Implementation Decisions

### Token-Exchange Mechanism

- **D-01:** Use Oracle's first-party `oci.auth.signers.TokenExchangeSigner` from `oci>=2.173.1,<3`. Instantiate with `audience`, `domain_base_url`, `client_id`, `client_secret`, call its security-token-acquisition method once per action invocation, extract the resulting UPST + ephemeral private key, write to disk. Tracks Oracle's reference example (PRD §References) and inherits Oracle's bug fixes via the minimum-pin floor.
- **D-02:** Sign once, dump UPST + ephemeral key, no in-action refresh. Action's contract is one exchange per invocation. UPST's natural ~60-min lifetime is the operating ceiling; OCI CLI does not refresh session tokens during execution anyway (oracle/oci-cli#998). This is documented in Action 1 README + REL-04 changelog.
- **D-03:** No-refresh stance applies even though `TokenExchangeSigner` supports it internally — the SDK refresh path is for in-process SDK callers, not for downstream `oci` CLI / external SDK invocations that read the on-disk token file.

### Cryptography & Networking

- **D-04:** Generate RSA-2048 keypair with `cryptography.hazmat.primitives.asymmetric.rsa.generate_private_key` (already a transitive dep of `oci` SDK; no new dep). Serialize public key as base64-encoded DER SubjectPublicKeyInfo for the `public_key` field in the token-exchange request. Write private key as PEM to `${output-key-path}` with `chmod 600`.
- **D-05:** Mint the GitHub OIDC ID token from Python via `requests.get(ACTIONS_ID_TOKEN_REQUEST_URL, params={'audience': <audience>}, headers={'Authorization': f'bearer {ACTIONS_ID_TOKEN_REQUEST_TOKEN}'})`. `requests` is a transitive dep of `oci`; explicit-list it in requirements.txt for auditability. ~5-line helper.
- **D-06:** 5xx / transient-failure backoff is a manual `time.sleep` loop, not a library. Schedule: 0.5s → 1s → 2s → 4s, max 3 retries, total wall-clock ~10s ceiling. Applies only to the token-exchange POST. 4xx responses never retry.

### Step / Action Structure

- **D-07:** `action.yml` has a single `runs:` block with `using: composite` and one `run:` step that does (in order): bash preflight check of `ACTIONS_ID_TOKEN_REQUEST_URL` / `_TOKEN` env vars; `pip install --user 'oci>=2.173.1,<3' requests cryptography`; `python ${{ github.action_path }}/exchange.py`. Bash uses `bash -e -o pipefail`. Single step minimises log noise and keeps logic cohesive in Python.
- **D-08:** Inputs flow to `exchange.py` exclusively via env vars (`INPUT_CLIENT_IDENTIFIER`, `INPUT_CLIENT_SECRET`, `INPUT_DOMAIN_BASE_URL`, `INPUT_AUDIENCE`, `INPUT_REGION`, `INPUT_OUTPUT_CONFIG_PATH`, `INPUT_OUTPUT_KEY_PATH`). Never `${{ inputs.foo }}` interpolated inline in a `run:` body. Eliminates script-injection class.
- **D-09:** Outputs (`config-path`, `expires-at`) are written by `exchange.py` directly to `$GITHUB_OUTPUT` via `os.environ['GITHUB_OUTPUT']` opened in append mode. Multi-line values use the heredoc form. Modern post-2022 GH-native pattern; `::set-output::` is forbidden (deprecated).
- **D-10:** `OCI_CLI_AUTH=security_token` is exported by `exchange.py` writing to `$GITHUB_ENV` in append mode. Visible to all subsequent steps in the same job per ARCHITECTURE.md research finding.

### Secret Masking & Error UX

- **D-11:** Mask order: (1) on entry to `exchange.py`, immediately register `INPUT_CLIENT_SECRET` via `print('::add-mask::' + value)` to stdout (defensive, even though it's already a GH secret); (2) after receiving the UPST, call `.strip()` on it BEFORE registering with `::add-mask::` to avoid the toolkit-#1421 multiline-no-op bug; (3) the ephemeral private key bytes are NOT masked — per-run-ephemeral and useless in isolation, masking adds log noise without security gain.
- **D-12:** ID-token preflight runs FIRST in the bash step, before `pip install`, so misconfigured workflows (missing `permissions: id-token: write`) fail in <1s. The bash check prints the exact YAML fix block via `::error::` and exits 1: `permissions:\n  id-token: write\n  contents: read`. Python re-checks the same env vars defensively but the bash gate is the primary path.
- **D-13:** OCI 4xx error UX: print the full HTTP response body (which contains `error` and `error_description` JSON fields) wrapped in a `::error::` workflow command, then exit 1. No pretty-printing, no curl reproduction snippet. Rationale: PITFALLS research confirmed ateam blogs (best source of expected error strings) returned 403 to fetch — we don't know the canonical strings, so dumping the raw body is most honest. Smoke test in Phase 3 will catalogue real strings empirically.

### OCI Config Persistence

- **D-14:** Write `[DEFAULT]` profile only — no named profiles. Matches PRD §"Behaviour" exactly, keeps Action 2 simple (no `--profile` flag plumbing).
- **D-15:** Overwrite policy: `${output-config-path}` and `${output-key-path}` are clobbered without warning if they already exist. Runner is ephemeral; the action owns these paths during its run. Documented in README. No "fail if exists" / "merge" / "append" logic.
- **D-16:** Config file structure: `[DEFAULT]\nsecurity_token_file=<absolute path>\nkey_file=<output-key-path>\nregion=<region>\n`. The `security_token_file` is a NEW absolute path Action 1 chooses (e.g. `${output-config-path%/*}/upst.token` — basename `upst.token`). Document the chosen `security_token_file` location in README so consumers know the action's full filesystem footprint.

### Pip Install Strategy

- **D-17:** Explicit-list dependencies: `pip install --user 'oci>=2.173.1,<3' requests cryptography`. Both `requests` and `cryptography` are transitive deps of `oci` today but explicit listing makes the action's deps auditable and protects against upstream churn.
- **D-18:** No caching inside Action 1. STACK research confirmed `actions/setup-python` cache is broken inside composite actions (issue #377). The smoke-test workflow (Phase 3) handles cross-run caching via `actions/cache@v5.0.5` directly, keyed on `hashFiles('actions/oci-token-exchange/requirements.txt')`. Action 1 itself takes the ~5–8s install hit per fresh runner — acceptable for deploy workflows.
- **D-19:** Lock the `oci>=2.173.1,<3` floor as decided now; only re-verify on minor SDK bumps or security CVE notice. Planner does NOT re-query PyPI at execute time. Floor was verified on 2026-05-09 per STACK.md.
- **D-20:** Ship a `requirements.txt` next to `exchange.py` with the same explicit list — keeps the action self-contained and lets the smoke-test cache key compute a stable hash.

### In-Phase Testing

- **D-21:** Phase 1 ships pytest unit tests for the pure-Python helpers in `exchange.py`. Coverage targets: keygen produces a 2048-bit RSA private key + correct base64-DER-SPKI public key encoding; retry loop respects 4xx-no-retry rule; retry loop respects 5xx max-3-attempts + ~10s wall-clock cap; error-formatting helper produces `::error::` strings with full JSON body; `$GITHUB_OUTPUT` and `$GITHUB_ENV` writers append correctly to provided file paths; mask helper calls `.strip()` before emitting `::add-mask::`. NO mocked `/oauth2/v1/token` integration tests — Phase 3 owns end-to-end coverage.
- **D-22:** Tests live in `actions/oci-token-exchange/tests/` co-located with the action source. `pytest.ini` or `pyproject.toml` at the action root configures discovery. `pytest` invocation: `pytest actions/oci-token-exchange/tests/`.
- **D-23:** Tests run via a new `unit-tests` job added to `.github/workflows/test-actions.yml` (file is created in Phase 1; smoke job added in Phase 3). The unit-tests job runs on every PR independent of the OCI-credentials gate, so even before `colour-within-ops` Phase 02 B populates secrets, regressions are caught.
- **D-24:** Lint: `ruff check actions/oci-token-exchange/` for Python (fast, sensible defaults; no separate `black` since modern ruff covers formatting), and `actionlint` for `actions/**/action.yml` (catches composite-action mistakes including `${{ }}`-in-`run:` injection patterns). Both run in the same `unit-tests` CI job. Lint failures block PR merge once test-actions.yml is required (Phase 3).
- **D-25:** Phase 1 ships a minimal `.github/workflows/test-actions.yml` containing only the `unit-tests` job. Phase 3 extends it with the `smoke` job and adds the branch-protection rule. This means test-actions.yml is created+committed in Phase 1, modified in Phase 3.

### Claude's Discretion

- Exact Python version-classifier inside `requirements.txt` (e.g., whether to add `python_requires` markers) — planner picks based on `oci` SDK's actual classifiers; runner is 3.12.3 so any reasonable lower bound works.
- Exact pytest fixture layout (conftest.py shape, parametrize style) — standard pytest conventions.
- Exact ruff rule configuration — start from ruff defaults; add rules only if a real issue surfaces.
- README structure (single file vs sections vs FAQ) — planner picks; must contain at minimum: usage example, required consumer permissions YAML, IPT prerequisites, audience-mapping note, the 60-min UPST ceiling caveat, Option A rationale (composite + Python), `requested_token_type=urn:oci:token-type:oci-upst` literal correction relative to upstream Oracle docs.
- Whether the action.yml `description:` quotes the upstream defects it replaces (CVE-2025-58754, wrong principal type) — leans toward yes for discoverability.

### Scope-Adjustment Acknowledgements

- **SCOPE-01:** Phase 1 expands beyond the literal REQUIREMENTS.md TOKEX-01..14 list to include unit tests + lint + a `unit-tests` CI job (D-21..D-25). Treated as implementation hardening, not a new capability — TOKEX-01..14 remain the user-visible contract; tests guard that contract from regression. Future REQUIREMENTS.md edit may add a TOKEX-15 (unit-test coverage) but not blocking; this CONTEXT.md is the authoritative scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source documents (project-internal)
- `PRD-composite-actions.md` — original PRD; canonical source for inputs/outputs/behaviour/error-handling spec
- `.planning/PROJECT.md` — project context, core value, key decisions, constraints (id-token-write requirement, audience default, region default, oci pin)
- `.planning/REQUIREMENTS.md` — TOKEX-01..14 acceptance criteria; v2 deferrals; out-of-scope rationale
- `.planning/research/STACK.md` — verified dep versions (oci 2.173.1, requests transitively, cryptography transitively, actions/cache@v5.0.5, actions/checkout SHA pins); composite-action caching limitations (issue #377)
- `.planning/research/FEATURES.md` — peer-action comparison (aws-actions/configure-aws-credentials, google-github-actions/auth, azure/login, hashicorp/vault-action); anti-features (post-job cleanup limitation, default silent masking)
- `.planning/research/ARCHITECTURE.md` — `$GITHUB_ENV` cross-step propagation semantics, in-action vs consumer-side permission boundaries, build-order rationale
- `.planning/research/PITFALLS.md` — toolkit issue #1421 multiline-secret bug, `requested_token_type` literal correction (`urn:oci:token-type:oci-upst`), Oracle SDK example audience placeholder gotcha (`github-actions` vs real `https://github.com/ColourWithin`), `principal.type=user` vs `workload` defect, composite-action `if: failure()` and `post:` lifecycle limitations, `${{ inputs.x }}`-in-`run:` injection
- `.planning/research/SUMMARY.md` — cross-cutting synthesis

### External canonical sources
- [Token Exchange Grant Type — exchanging a JWT for a UPST](https://docs.oracle.com/en-us/iaas/Content/Identity/api-getstarted/json_web_token_exchange.htm) — canonical request shape
- [Oracle Python SDK example — workload_identity_federation_signer_example.py](https://github.com/oracle/oci-python-sdk/blob/master/examples/workload_identity_federation_signer_example.py) — first-party GH Actions integration reference
- [GitHub Actions OIDC reference](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect) — OIDC token mint mechanics
- [Oracle SDK `oci.auth.signers.TokenExchangeSigner`](https://docs.oracle.com/en-us/iaas/tools/python/latest/api/signing.html) — primary integration target
- [oracle/oci-cli#998](https://github.com/oracle/oci-cli/issues/998) — session token refresh limitation, document in README/changelog
- [actions/toolkit#1421](https://github.com/actions/toolkit/issues/1421) — multiline `setSecret` no-op bug, drives D-11
- [actions/setup-python#377](https://github.com/actions/setup-python/issues/377) — composite-action caching incompatibility, drives D-18

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

This is a greenfield repo (.github org repo with only community-health docs and a profile/ subdir). No existing Python, no existing action.yml — Phase 1 creates `actions/oci-token-exchange/` from scratch.

### Established Patterns

- Repo uses GPG-signed commits with developer sign-off (per user's global CLAUDE.md). Commit hooks should produce `git commit -s` automatically.
- `.gitignore` already covers Jekyll + Ruby/bundler artefacts (legacy from GH Pages community-files convention) and `.idea/` (added during /gsd-new-project init). New Python artefacts (`__pycache__/`, `*.pyc`, `.pytest_cache/`, `*.egg-info/`) need to be added.

### Integration Points

- `actions/oci-token-exchange/` is referenced by `colour-within-ops` workflows via `uses: ColourWithin/.github/actions/oci-token-exchange@<sha>`. The doubled `.github` path is intentional (GitHub org-default-repo rule) and gets called out in README.
- `actions/oci-token-exchange/` is also referenced from this repo's own `.github/workflows/test-actions.yml` via `uses: ./actions/oci-token-exchange` for the smoke job (Phase 3) and `unit-tests` job (Phase 1).
- The `unit-tests` job in `.github/workflows/test-actions.yml` is a NEW file in this phase; Phase 3 extends it.

</code_context>

<specifics>
## Specific Ideas

- README must call out the `requested_token_type=urn:oci:token-type:oci-upst` literal explicitly because the PRD §"Behaviour" step 3 has a typo (uses the shorter form). The corrected literal is canonical OCI per PITFALLS.md and the linked Oracle JWT-to-UPST docs.
- README should call out the audience default mismatch hazard: Oracle's GH Actions SDK example uses `audience: "github-actions"` as a placeholder; our default is `https://github.com/ColourWithin` and consumers MUST configure their IPT to match.
- Action's `description:` field can mention "replaces gtrevorrow/oci-token-exchange-action (CVE-2025-58754, wrong principal type)" for discoverability when contributors search the org.
- Lint job must include actionlint specifically configured to flag `${{ inputs.* }}` interpolation in `run:` bodies (the PITFALLS injection vector).

</specifics>

<deferred>
## Deferred Ideas

- **Hash-pinned requirements.txt** with `--require-hashes` — rejected for v1.0 (high churn for patch bumps); revisit at v2.0 supply-chain hardening pass.
- **In-action UPST refresh helper** — rejected for v1.0; jobs that exceed ~55 min should re-invoke Action 1 between long phases. Operator pattern, not action capability.
- **Mocked-OCI integration test** of the full exchange.py — rejected; locks in our assumed request shape and would silently mask Oracle API drift. Phase 3 smoke against real OCI is the integration check.
- **`tenacity` / `urllib3.Retry` adapter** for backoff — rejected; manual `time.sleep` loop is ~15 lines and avoids new dep.
- **Named OCI config profile** (e.g. `[github-actions]`) for composability with pre-existing user configs — rejected; runner is fresh, no merge target.
- **TOKEX-V2-01 / V2-02 hardening** (workload-principal assertion, audience claim validation) — already in REQUIREMENTS.md v2; explicitly NOT for Phase 1.
- **Black formatter** in lint job — rejected; modern ruff includes formatter.
- **Top-level `tests/` directory** — rejected in favour of co-located `actions/oci-token-exchange/tests/`.

</deferred>

---

*Phase: 1-OCI Token Exchange Action*
*Context gathered: 2026-05-09*
