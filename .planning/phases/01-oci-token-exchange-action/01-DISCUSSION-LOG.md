# Phase 1: OCI Token Exchange Action - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 1-OCI Token Exchange Action
**Areas discussed:** Token-exchange path, Step decomposition, Pip install strategy, In-phase testing

---

## Token-exchange path

### Q1: Exchange mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Oracle SDK TokenExchangeSigner | Use `oci.auth.signers.TokenExchangeSigner`. Tracks Oracle's first-party reference example exactly. | ✓ |
| Hand-rolled requests.post | Direct POST to `${domain}/oauth2/v1/token` with explicit body. Full control. | |
| Hybrid — raw POST, SDK key utilities | Hand-rolled HTTP for exchange, SDK helpers for key scaffolding. | |

### Q2: Keypair generation

| Option | Description | Selected |
|--------|-------------|----------|
| cryptography library | Transitive dep of oci SDK already. PEM serialization built-in. | ✓ |
| openssl shell-out | Zero new dep, but adds subprocess error handling. | |
| PyCryptodome | Adds new dependency, no advantage. | |

### Q3: OIDC token mint

| Option | Description | Selected |
|--------|-------------|----------|
| requests.get to ACTIONS_ID_TOKEN_REQUEST_URL | Direct GET with audience param + bearer header. | ✓ |
| urllib stdlib | No-dep alternative, more verbose. | |
| Shell-out to curl | Mix Python with curl, shell-quoting risk. | |

### Q4: Backoff implementation

| Option | Description | Selected |
|--------|-------------|----------|
| Manual time.sleep loop | ~15 lines, no new dep. exp 0.5→1→2→4s, max 3 attempts ~10s. | ✓ |
| tenacity decorator | Cleaner code, new pinned dep. Overkill for one call site. | |
| urllib3 Retry adapter | Built-in to urllib3, less obvious for readers. | |

### Q5: Token persistence

| Option | Description | Selected |
|--------|-------------|----------|
| Sign once, dump UPST + key, no in-action refresh | Stateless action; rely on UPST's natural ~60min lifetime. | ✓ |
| Configure signer for refresh | SDK callers get auto-refresh; CLI callers don't. Mixed semantics. | |
| Write helper script for refresh | Out of scope for v1.0. | |

### Q6: Key path

| Option | Description | Selected |
|--------|-------------|----------|
| ${output-key-path} only | Single file, chmod 600. Matches PRD's named input. | ✓ |
| Plus copy at oci_private_key.pem | Mirrors some Oracle examples; redundant. | |
| Tempfile dir, path emitted as output | Breaks PRD's stable default location. | |

### Q7: Mask order

| Option | Description | Selected |
|--------|-------------|----------|
| client-secret on read; UPST after .strip() then ::add-mask::; never mask key bytes | Targeted, avoids toolkit #1421 multiline bug. | ✓ |
| Mask everything that touches disk | Defensive but noisy; PEM newlines may multi-line-break mask. | |
| Mask UPST only | Skip client-secret remask. | |

### Q8: 4xx error UX

| Option | Description | Selected |
|--------|-------------|----------|
| Print full JSON body via ::error:: + exit 1 | Raw error/error_description verbatim, no interpretation. | ✓ |
| Pretty-print fields + reproduction curl | Helpful but command shape might drift. | |
| Both | Belt-and-braces, noisier logs. | |

### Q9: Signer usage detail

| Option | Description | Selected |
|--------|-------------|----------|
| Instantiate signer + call .get_security_token() once | Tracks SDK; extract token + key, write to disk. | ✓ |
| Read SDK source, replicate request directly | Decouples from internal SDK refactors but loses bug fixes. | |
| Skip signer; build from oci docs | Already chose SDK signer. | |

### Q10: ID-token preflight

| Option | Description | Selected |
|--------|-------------|----------|
| First thing in exchange.py + bash gate | Saves time, gives clearest error. | ✓ |
| In action.yml bash preamble before python | Bash-only, slightly less portable. | |
| Let requests.get fail naturally | Reactive, less helpful. | |

### Q11: OCI config profile

| Option | Description | Selected |
|--------|-------------|----------|
| [DEFAULT] only | Matches PRD literally; simplest consumer surface. | ✓ |
| Named profile | Composable but adds --profile requirement on Action 2. | |
| Both | Belt-and-braces; ConfigParser quirks. | |

### Q12: Overwrite policy

| Option | Description | Selected |
|--------|-------------|----------|
| Overwrite without warning | Runner is ephemeral; action owns paths during its run. | ✓ |
| Fail if exists | Defensive but awkward UX. | |
| Append/fail | Surprising behaviour. | |

**Notes:** TokenExchangeSigner persistence stays one-shot — UPST's ~60min ceiling is the operating envelope; OCI CLI can't refresh anyway (oracle/oci-cli#998). All recommended (default) options accepted.

---

## Step decomposition

### Q1: action.yml step structure

| Option | Description | Selected |
|--------|-------------|----------|
| Single step: bash invokes python | One run: step does install + python exchange.py. setSecret in Python. | ✓ |
| Multi-step: install → exchange → outputs | Three steps, clearer logs but cluttered + awkward env passing. | |
| Two steps: preflight (bash) + exchange (python) | Hybrid; preflight benefit + cohesion. | |

### Q2: Inputs to exchange.py

| Option | Description | Selected |
|--------|-------------|----------|
| Env vars | env: { INPUT_*: ${{ inputs.* }} } on bash step. No shell-quoting risk. | ✓ |
| CLI args | Inputs through shell parsing — injection risk. | |
| Mix (secrets via env, non-secrets via args) | Inconsistent. | |

### Q3: Step outputs emission

| Option | Description | Selected |
|--------|-------------|----------|
| Append to $GITHUB_OUTPUT from Python | Modern post-2022 GH-native pattern; heredoc for multi-line. | ✓ |
| ::set-output:: | Deprecated in 2022. Don't use. | |
| Python prints, bash captures + writes | Two-phase; unnecessary parsing layer. | |

### Q4: OCI_CLI_AUTH export

| Option | Description | Selected |
|--------|-------------|----------|
| Append to $GITHUB_ENV from Python | Direct write; visible to all subsequent steps. | ✓ |
| Bash post-step appends after python returns | Same effect, two layers. | |
| core.exportVariable via curl | Round-trip workflow command, unnecessary. | |

**Notes:** Single-step + env-var inputs + Python-direct $GITHUB_OUTPUT/$GITHUB_ENV writes — minimal layers, maximal injection-safety.

---

## Pip install strategy

### Q1: Dep list

| Option | Description | Selected |
|--------|-------------|----------|
| oci + requests + cryptography (explicit) | Auditable; protects against transitive churn. | ✓ |
| Just oci (rely on transitives) | Minimal; risk if Oracle drops requests/cryptography. | |
| requirements.txt with hash pins | High supply-chain hygiene; high churn. Defer to v2. | |

### Q2: Caching

| Option | Description | Selected |
|--------|-------------|----------|
| No caching inside Action 1; consumer's workflow handles it | setup-python cache broken in composites (issue #377). | ✓ |
| Sentinel-file like Action 2 | Marginal benefit; Action 1 typically once per job. | |
| Try setup-python cache first, fall back | Known broken inside composites. | |

### Q3: Install order vs preflight

| Option | Description | Selected |
|--------|-------------|----------|
| Preflight in bash BEFORE pip install | Fast-fail on missing id-token: write permission. | ✓ |
| Pip install first, preflight in Python | Always pay install cost. | |
| Both — bash pre-check AND python re-check | Defensive, unnecessary. | |

### Q4: Floor verification

| Option | Description | Selected |
|--------|-------------|----------|
| Lock 2.173.1 floor; re-verify only on minor SDK bumps | STACK research verified 2026-05-09. | ✓ |
| Re-verify floor at execute time | Adds latency, marginal value. | |
| Pin to exact floor (==2.173.1) | Freezes patch fixes; research recommended minimum-pin. | |

**Notes:** Explicit deps + no in-action cache + bash preflight before install + locked floor.

---

## In-phase testing

### Q1: Ship pytest unit tests?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — unit tests for keygen + retry + JWT + error formatting | Cover pure-Python helpers; no OCI mocking. | ✓ |
| Yes — plus mock-based integration test of full exchange.py | Locks in assumed request shape; mock passes but real call could fail. | |
| No — rely solely on Phase 3 smoke test | Risk silent regressions until smoke runs. | |

### Q2: Test layout

| Option | Description | Selected |
|--------|-------------|----------|
| actions/oci-token-exchange/tests/ | Co-located with action; ships with source. | ✓ |
| Top-level tests/ directory | Mixes tests for both actions; less clear ownership. | |
| Inside exchange.py via doctest | Limits to functional tests; can't parametrize. | |

### Q3: Test execution

| Option | Description | Selected |
|--------|-------------|----------|
| New unit-tests job in test-actions.yml | Runs every PR; no OCI secrets needed. | ✓ |
| Separate workflow file (test-unit.yml) | Two workflow files for one PR. | |
| Run only locally; no CI gate | Unenforced; rejected. | |

### Q4: Lint

| Option | Description | Selected |
|--------|-------------|----------|
| ruff (Python) + actionlint (action.yml) | Fast, sensible defaults; catches injection patterns. | ✓ |
| ruff + black + actionlint | black redundant with modern ruff. | |
| Just actionlint | Skips Python lint. | |

### Scope-clarification follow-up

| Option | Description | Selected |
|--------|-------------|----------|
| Acknowledge — testing IS implementation | Lock into CONTEXT.md as decisions; TOKEX-01..14 unchanged. | ✓ |
| Add explicit TOKEX-15 to REQUIREMENTS.md | Cleaner provenance; not blocking. | |
| Defer tests to v1.1 | Faster ship, regression risk. | |

**Notes:** Phase 1 grows to include tests + lint + a CI job — a scope clarification on HOW to implement TOKEX-01..14, not a new capability. Test-actions.yml gets created in Phase 1 (unit-tests job only); Phase 3 extends with smoke job.

---

## Claude's Discretion

- Exact `python_requires` markers in requirements.txt
- pytest fixture layout (conftest.py shape, parametrize style)
- ruff rule configuration (start from defaults)
- README structure (single file vs sectioned vs FAQ)
- Whether action.yml `description:` field quotes the upstream defects being replaced

## Deferred Ideas

- Hash-pinned requirements.txt (--require-hashes) — defer to v2.0 supply-chain pass
- In-action UPST refresh helper — operator-side concern; jobs >55min should re-invoke Action 1
- Mocked-OCI integration test of full exchange.py — masks Oracle API drift
- tenacity / urllib3.Retry for backoff — manual loop is ~15 lines
- Named OCI config profile — runner is fresh, no merge target
- TOKEX-V2-01 / V2-02 hardening (workload-principal assertion, audience claim validation) — already in REQUIREMENTS.md v2
- Black formatter — modern ruff covers formatting
- Top-level tests/ directory — co-located preferred
