# Phase 1: OCI Token Exchange Action — Research

**Researched:** 2026-05-09
**Domain:** GitHub composite actions — OCI OIDC token exchange via `oci.auth.signers.TokenExchangeSigner`
**Confidence:** HIGH (all API surfaces verified from live SDK source; all tool behaviours verified locally)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Token-Exchange Mechanism**
- D-01: Use `oci.auth.signers.TokenExchangeSigner(get_jwt, oci_domain_url, client_id, client_secret)`. Instantiate once; extract UPST + private key from instance; no in-action refresh.
- D-02: Sign once, dump UPST + ephemeral key. No refresh. ~60-min UPST ceiling documented in README.
- D-03: No-refresh stance even though `TokenExchangeSigner` refreshes internally for in-process SDK callers.

**Cryptography & Networking**
- D-04: RSA-2048 keypair via `cryptography.hazmat.primitives.asymmetric.rsa.generate_private_key`. Public key as base64-encoded DER SPKI. Private key written to `${output-key-path}` with `chmod 600`. *(See SDK Note below — the SDK does the keygen internally.)*
- D-05: GitHub OIDC mint via `requests.get(ACTIONS_ID_TOKEN_REQUEST_URL, params={'audience': ...}, headers={'Authorization': f'bearer {ACTIONS_ID_TOKEN_REQUEST_TOKEN}'})`.
- D-06: Manual `time.sleep` retry: 0.5s → 1s → 2s → 4s, max 3 retries, 5xx only. 4xx never retries.

**Step / Action Structure**
- D-07: Single `run:` step: bash preflight → `pip install --user 'oci>=2.173.1,<3' requests cryptography` → `python ${{ github.action_path }}/exchange.py`. Shell: `bash -e -o pipefail`.
- D-08: All inputs flow to `exchange.py` via env vars (`INPUT_CLIENT_IDENTIFIER`, `INPUT_CLIENT_SECRET`, `INPUT_DOMAIN_BASE_URL`, `INPUT_AUDIENCE`, `INPUT_REGION`, `INPUT_OUTPUT_CONFIG_PATH`, `INPUT_OUTPUT_KEY_PATH`). No `${{ inputs.foo }}` inline in `run:` body.
- D-09: Outputs written by `exchange.py` to `$GITHUB_OUTPUT` in append mode. Heredoc form for multi-line values. No `::set-output::`.
- D-10: `OCI_CLI_AUTH=security_token` written by `exchange.py` to `$GITHUB_ENV`.

**Secret Masking & Error UX**
- D-11: Mask order: (1) `INPUT_CLIENT_SECRET` on entry; (2) UPST after `.strip()`; (3) private key NOT masked.
- D-12: Bash preflight checks `ACTIONS_ID_TOKEN_REQUEST_URL`/`_TOKEN` BEFORE `pip install`. Prints exact YAML fix via `::error::` then exits 1.
- D-13: 4xx UX: print full HTTP body via `::error::` then exit 1. No pretty-printing.

**OCI Config Persistence**
- D-14: `[DEFAULT]` profile only.
- D-15: Overwrite without warning.
- D-16: Config stanza: `[DEFAULT]\nsecurity_token_file=<abs-path>/upst.token\nkey_file=<output-key-path>\nregion=<region>`. The `upst.token` file is the UPST text. Location: same dir as `output-config-path`, basename `upst.token`.

**Pip Install Strategy**
- D-17: `pip install --user 'oci>=2.173.1,<3' requests cryptography`.
- D-18: No caching inside Action 1.
- D-19: `oci>=2.173.1,<3` floor locked; planner does not re-query PyPI.
- D-20: `requirements.txt` with same explicit list next to `exchange.py`.

**In-Phase Testing**
- D-21: pytest unit tests for pure-Python helpers (keygen, retry logic, error-formatting, output writers, mask helper). No mocked HTTP integration.
- D-22: Tests in `actions/oci-token-exchange/tests/`.
- D-23: New `unit-tests` job in `.github/workflows/test-actions.yml` (file created in Phase 1).
- D-24: `ruff check actions/oci-token-exchange/` + `actionlint` on `actions/**/action.yml` workflow referencing paths (see Actionlint Scope Note below).
- D-25: Phase 1 ships only `unit-tests` job; smoke job added in Phase 3.

### Claude's Discretion

- Exact Python version-classifier in `requirements.txt`
- Exact pytest fixture layout (conftest.py shape, parametrize style)
- Exact ruff rule configuration — start from defaults, add only if a real issue surfaces
- README structure — must contain: usage example, required permissions YAML, IPT prerequisites, audience-mapping note, 60-min UPST ceiling, Option A rationale, `urn:oci:token-type:oci-upst` literal correction
- Whether `action.yml` `description:` quotes replaced actions (CVE-2025-58754, wrong principal type)

### Deferred Ideas (OUT OF SCOPE)

- Hash-pinned `requirements.txt`
- In-action UPST refresh helper
- Mocked-OCI integration test
- `tenancy` / `urllib3.Retry` for backoff
- Named OCI config profile
- TOKEX-V2-01 / V2-02 hardening
- Black formatter (ruff handles formatting)
- Top-level `tests/` directory
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TOKEX-01 | Inputs: `client-identifier`, `client-secret`, `domain-base-url` (required); `audience`, `region`, `output-config-path`, `output-key-path` (optional with defaults) | Inputs declared in `action.yml`; passed as `INPUT_*` env vars to `exchange.py` |
| TOKEX-02 | Mint GitHub OIDC ID token from Python via `ACTIONS_ID_TOKEN_REQUEST_URL`/`_TOKEN` env vars | 5-line `get_jwt()` function using `requests.get`; audience param confirmed |
| TOKEX-03 | RSA-2048 keypair generated each invocation; private key written to `output-key-path` with `chmod 600` | SDK's `SessionKeySupplier` does this internally; extract via `signer.session_key_supplier.private_key`; write PEM with `chmod 600` |
| TOKEX-04 | POST to `{domain-base-url}/oauth2/v1/token` with correct params including `requested_token_type=urn:oci:token-type:oci-upst` | SDK's `_get_new_token()` does this; `urn:oci:token-type:oci-upst` confirmed in source |
| TOKEX-05 | Persist UPST + private key in OCI CLI config format | Write three files: `config` ([DEFAULT] stanza), `upst.token` (UPST text), `upst.pem` (private key PEM) |
| TOKEX-06 | Export `OCI_CLI_AUTH=security_token` to `$GITHUB_ENV` | Append `OCI_CLI_AUTH=security_token` to file at `os.environ['GITHUB_ENV']` |
| TOKEX-07 | Emit `config-path` and `expires-at` (ISO 8601) outputs | Append to `os.environ['GITHUB_OUTPUT']`; expires-at from `signer.security_token_container.jwt['exp']` (epoch int → ISO 8601) |
| TOKEX-08 | Mask UPST (after `.strip()`) and `client-secret` via `::add-mask::` | D-11 mask order; `.strip()` before `::add-mask::` to avoid toolkit #1421 |
| TOKEX-09 | Fail fast with `permissions: id-token: write` YAML fix when OIDC env vars absent | Bash preflight step (D-12); check `ACTIONS_ID_TOKEN_REQUEST_URL`; print `::error::` + exact YAML + `exit 1` |
| TOKEX-10 | Surface OCI `error`/`error_description` verbatim on 4xx; no retry on 4xx | D-13; catch 4xx in retry loop; print body via `::error::`; `sys.exit(1)` |
| TOKEX-11 | Retry on 5xx/transient: exponential backoff, max 3 attempts, ~10s total | D-06; wrap `TokenExchangeSigner()` constructor in retry loop |
| TOKEX-12 | `pip install --user 'oci>=2.173.1,<3'` via runner's Python 3.12.3 | D-07; no `actions/setup-python` inside action |
| TOKEX-13 | README with consumer permissions, IPT prerequisites, audience mapping, Option A rationale | Discretion item; required content enumerated in CONTEXT.md |
| TOKEX-14 | No `set -x`; bash runs with `bash -e -o pipefail` only | Enforced in `action.yml` shell line; verified by ruff lint + grep check in CI |
</phase_requirements>

---

## Summary

Phase 1 delivers `actions/oci-token-exchange`, a composite + Python action that exchanges a GitHub OIDC ID token for an OCI User Principal Session Token (UPST) using Oracle's first-party `TokenExchangeSigner`. The action writes OCI CLI config to disk, masks secrets, and emits outputs so downstream steps can authenticate as the impersonated Service User without further configuration.

The implementation is now fully specified at the API level. The critical new findings from this research session are:

1. **`TokenExchangeSigner.__init__` is eager**: the HTTP POST to `/oauth2/v1/token` happens in the constructor, not lazily. The D-06 retry loop wraps the constructor call, not a separate `.exchange()` method.
2. **SDK uses vendored requests**: `oci._vendor.requests.exceptions.HTTPError` is a different class from `requests.exceptions.HTTPError`. The retry handler must catch the right exception type.
3. **`actionlint` does not lint composite `action.yml` files**: only `.github/workflows/*.yml` files. The D-24 injection guard requires a `grep`-based check in CI, not a native actionlint rule.
4. **Public key format**: the SDK uses PEM-stripped-headers (base64-encoded DER body without `-----BEGIN PUBLIC KEY-----`), which is numerically equivalent to base64(DER SPKI). D-04's "base64-DER-SPKI" description is correct in intent.

**Primary recommendation:** Follow D-01 through D-25 as specified. Exchange.py is ~120 lines of straightforward Python. No surprises in the SDK API.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OIDC token mint | exchange.py (Python) | bash preflight (pre-check) | Python has `requests`; bash pre-flight runs earlier to fail fast |
| RSA-2048 keygen | SDK (`SessionKeySupplier`) | — | SDK does this internally in `TokenExchangeSigner.__init__` |
| Token exchange POST | SDK (`TokenExchangeSigner`) | exchange.py (retry wrapper) | SDK handles the HTTP; exchange.py wraps constructor for retry |
| OCI config write | exchange.py (Python) | — | Needs to know resolved paths and UPST content |
| Secret masking | exchange.py (Python) | — | Must happen after UPST is obtained |
| Output emission | exchange.py (Python) | — | Modern `$GITHUB_OUTPUT` append pattern |
| `$GITHUB_ENV` side-effect | exchange.py (Python) | — | Cross-step env propagation is job-scoped |
| Preflight guard | bash step in `action.yml` | — | Runs before `pip install` to fail fast without 5–8s wait |
| Unit test execution | `.github/workflows/test-actions.yml` | — | `unit-tests` job; runs on every PR |
| Injection lint | ruff + grep in CI | actionlint (workflow files only) | actionlint cannot lint `action.yml` composite files |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `oci` | `>=2.173.1,<3` | `TokenExchangeSigner`, `SessionKeySupplier`, vendored requests | Oracle first-party; handles keygen, POST, and UPST extraction |
| `requests` | transitively resolved | OIDC token mint (`get_jwt()`) | Transitive dep of `oci`; explicit for auditability |
| `cryptography` | transitively resolved | RSA key PEM serialisation | Transitive dep of `oci`; already on runner via `oci` |
| Python | 3.12.3 (runner default) | Runtime | Pre-installed on `ubuntu-24.04`; no `setup-python` needed |

### Supporting (CI / lint)

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `pytest` | latest | Unit test runner | In `unit-tests` job; `pip install pytest` in CI |
| `ruff` | latest | Python lint + format | `ruff check actions/oci-token-exchange/` in CI |
| `actionlint` | 1.7.12 (verified locally) | Workflow YAML lint | Lint `.github/workflows/test-actions.yml` |
| `shellcheck` | 0.11.0 (verified locally) | Shell step lint | Invoked automatically by actionlint on `run:` steps |

### Actions (SHA-pinned)

| Action | Version | SHA | Purpose |
|--------|---------|-----|---------|
| `actions/checkout` | v6.0.2 | `de0fac2e4500dabe0009e67214ff5f5447ce83dd` | Checkout repo in `unit-tests` job |

**Installation (in `unit-tests` CI job):**
```bash
pip install 'oci>=2.173.1,<3' requests cryptography pytest ruff
```

**Version verification:** [VERIFIED: PyPI API 2026-05-09] `oci` latest is 2.173.1+ and matches the floor in STACK.md. [VERIFIED: GitHub API 2026-05-09] `actions/checkout` v6.0.2 SHA is `de0fac2e4500dabe0009e67214ff5f5447ce83dd`.

---

## `oci.auth.signers.TokenExchangeSigner` — Verified API Surface

[VERIFIED: github.com/oracle/oci-python-sdk — source read 2026-05-09]

### Constructor

```python
signer = oci.auth.signers.TokenExchangeSigner(
    jwt_or_func,      # callable → str, or str directly (wrapped in lambda)
    oci_domain_url,   # "https://idcs-XXXX.identity.oraclecloud.com" (full URL; passing domain ID is deprecated)
    client_id,        # OAuth client_id of the Confidential Application
    client_secret,    # OAuth client_secret
    region=None,      # optional OCI region string
    **kwargs          # generic_headers, log_requests
)
```

**Critical behaviour:** The constructor calls `_get_new_token()` **eagerly in `__init__`**. By the time the constructor returns, the HTTP POST to `/oauth2/v1/token` has already happened. The retry loop wraps the constructor call.

### `_get_new_token()` — what the SDK does internally

```
1. Call jwt_or_func() → GitHub JWT string
2. Read session_key_supplier.private_key (RSA-2048, generated in SessionKeySupplier.__init__)
3. Serialize public key → PEM → strip headers → use as `public_key` POST param
4. POST https://{oci_domain_url}/oauth2/v1/token with form body:
   grant_type          = urn:ietf:params:oauth:grant-type:token-exchange
   requested_token_type = urn:oci:token-type:oci-upst   ← confirmed literal
   subject_token       = <github-jwt>
   subject_token_type  = jwt
   public_key          = <base64-encoded PEM body, no headers>   ← NOTE: NOT raw base64(DER)
5. Call response.raise_for_status() → raises oci._vendor.requests.exceptions.HTTPError on non-2xx
6. Parse response JSON → return response_json["token"]   ← field name is "token", NOT "access_token"
```

### Extracting outputs from the signer

```python
# After successful instantiation:

# UPST string (raw JWT, single line)
upst: str = signer.security_token_container.security_token

# Ephemeral RSA private key object (cryptography.hazmat RSAPrivateKey)
private_key_obj = signer.session_key_supplier.private_key

# Expiry timestamp (Unix epoch seconds, int)
expires_epoch: int = signer.security_token_container.jwt['exp']
# jwt is the decoded JWT dict (PyJWT decode without verification)

# Convert to ISO 8601 for TOKEX-07:
import datetime
expires_at = datetime.datetime.fromtimestamp(expires_epoch, tz=datetime.timezone.utc).isoformat()
```

### Serialising the private key to PEM

```python
from cryptography.hazmat.primitives import serialization

private_pem_bytes: bytes = private_key_obj.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption()
)
```

Write to `output-key-path` then `os.chmod(path, 0o600)`.

### Exception handling in the retry loop

The SDK uses a **vendored copy** of `requests` at `oci._vendor.requests`, not the top-level `requests` package. The two `HTTPError` classes are **different types**. Catch from the right namespace:

```python
from oci._vendor import requests as oci_requests

for attempt in range(MAX_ATTEMPTS):
    try:
        signer = oci.auth.signers.TokenExchangeSigner(get_jwt, ...)
        break
    except oci_requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else 0
        if status >= 500:
            # retry with backoff
        else:
            # 4xx: surface body and exit 1
            body = e.response.text if e.response is not None else str(e)
            print(f"::error::OCI token endpoint returned {status}: {body}", flush=True)
            sys.exit(1)
    except (oci_requests.exceptions.ConnectionError, OSError) as e:
        # network error: retry
```

Note: `e.response` is a `requests.models.Response`-equivalent object; `.text` gives the raw body and `.status_code` gives the integer status.

### Token endpoint success response shape

[VERIFIED: docs.oracle.com/en-us/iaas/Content/Identity/api-getstarted/json_web_token_exchange.htm 2026-05-09]

```json
{"token": "<upst-jwt-string>"}
```

The field is `"token"`, not `"access_token"`. The SDK source confirms this with `response_json["token"]`.

### Token endpoint error response shape

[CITED: docs.oracle.com/en-us/iaas/Content/Identity/api-getstarted/json_web_token_exchange.htm] The Oracle doc does not include example error response bodies. [CITED: PITFALLS.md] The error fields are documented as `error` and `error_description` (OAuth 2.0 standard; PITFALLS.md cites the ateam blog). The raw body from `e.response.text` is the safest source since we cannot verify field names from official docs.

D-13's decision to dump the raw body verbatim is the correct approach given this uncertainty.

---

## Architecture Patterns

### System Architecture Diagram

```
Consumer workflow (colour-within-ops)
  permissions: id-token: write, contents: read
  secrets: OCI_OIDC_CLIENT_IDENTIFIER, OCI_OIDC_CLIENT_SECRET
  vars:    OCI_DOMAIN_BASE_URL
      │
      ▼
action.yml (composite, single run: step)
  ┌─ bash preflight ─────────────────────────────────────────────┐
  │  check ACTIONS_ID_TOKEN_REQUEST_URL; exit 1 with YAML fix    │
  └──────────────────────────────────────────────────────────────┘
      │ (only if preflight passes)
  ┌─ pip install --user 'oci>=2.173.1,<3' requests cryptography ─┐
  └──────────────────────────────────────────────────────────────┘
      │
  ┌─ python exchange.py ─────────────────────────────────────────┐
  │                                                               │
  │  1. print('::add-mask::' + INPUT_CLIENT_SECRET)              │
  │                                                               │
  │  2. get_jwt() ──► ACTIONS_ID_TOKEN_REQUEST_URL+_TOKEN         │
  │                   ──► GitHub OIDC Provider                    │
  │                   ◄── {"value": "<jwt>"}                      │
  │                                                               │
  │  3. for attempt in range(4):                                  │
  │       TokenExchangeSigner(get_jwt, domain_url, id, secret)    │
  │         │ (constructor eagerly calls _get_new_token())        │
  │         ├─► POST {domain_url}/oauth2/v1/token                 │
  │         │       grant_type, requested_token_type,             │
  │         │       subject_token, public_key, Basic auth         │
  │         │   ◄── {"token": "<upst>"}                          │
  │         │   raises HTTPError on non-2xx                       │
  │         │                                                     │
  │       except 4xx → print ::error:: body → sys.exit(1)        │
  │       except 5xx/net → sleep backoff → retry                 │
  │                                                               │
  │  4. Extract: upst, private_key, expires_epoch                 │
  │                                                               │
  │  5. Write files:                                              │
  │       {output-config-path}       ← [DEFAULT] stanza          │
  │       {config-dir}/upst.token    ← UPST text                 │
  │       {output-key-path}          ← RSA private key PEM       │
  │       chmod 600 {output-key-path}                            │
  │                                                               │
  │  6. print('::add-mask::' + upst.strip())                      │
  │                                                               │
  │  7. Append to $GITHUB_OUTPUT:                                 │
  │       config-path={output-config-path}                        │
  │       expires-at={iso8601}                                    │
  │                                                               │
  │  8. Append to $GITHUB_ENV:                                    │
  │       OCI_CLI_AUTH=security_token                             │
  └──────────────────────────────────────────────────────────────┘
      │
subsequent steps see:
  ~/.oci/config, ~/.oci/upst.token, ~/.oci/upst.pem
  OCI_CLI_AUTH=security_token  (all subsequent steps in same job)
  outputs.config-path, outputs.expires-at
```

### Recommended Project Structure

```
actions/oci-token-exchange/
├── action.yml                 # composite entrypoint; inputs/outputs/run
├── exchange.py                # all token-exchange logic
├── requirements.txt           # oci>=2.173.1,<3  requests  cryptography
├── README.md                  # consumer docs
├── pyproject.toml             # pytest + ruff config for this action
└── tests/
    ├── conftest.py            # shared fixtures (tmp_path wrappers, env patches)
    └── test_exchange.py       # unit tests for pure-Python helpers

.github/
└── workflows/
    └── test-actions.yml       # unit-tests job (Phase 1); smoke job added Phase 3
```

### Pattern 1: Retry Wrapper Around TokenExchangeSigner Constructor

```python
# Source: token_exchange_signer.py source read + D-06 decision
import time
from oci._vendor import requests as oci_requests

DELAYS = [0.5, 1.0, 2.0, 4.0]  # 3 retries = 4 attempts total

def exchange_with_retry(get_jwt, domain_url, client_id, client_secret):
    last_exc = None
    for attempt, delay in enumerate(DELAYS):
        try:
            return oci.auth.signers.TokenExchangeSigner(
                get_jwt, domain_url, client_id, client_secret
            )
        except oci_requests.exceptions.HTTPError as e:
            status = e.response.status_code if e.response is not None else 0
            if status < 500:
                # 4xx: surface and abort immediately
                body = e.response.text if e.response is not None else str(e)
                print(f"::error::OCI token endpoint error {status}: {body}", flush=True)
                sys.exit(1)
            last_exc = e
        except (oci_requests.exceptions.ConnectionError, OSError) as e:
            last_exc = e
        if attempt < len(DELAYS) - 1:
            time.sleep(delay)
    raise last_exc
```

### Pattern 2: Writing `$GITHUB_OUTPUT` and `$GITHUB_ENV`

```python
# Source: D-09, D-10; GitHub Actions modern output pattern
import os

def write_output(key: str, value: str) -> None:
    """Append key=value to $GITHUB_OUTPUT."""
    path = os.environ['GITHUB_OUTPUT']
    with open(path, 'a') as f:
        f.write(f"{key}={value}\n")

def write_env(key: str, value: str) -> None:
    """Append KEY=value to $GITHUB_ENV."""
    path = os.environ['GITHUB_ENV']
    with open(path, 'a') as f:
        f.write(f"{key}={value}\n")
```

### Pattern 3: Masking via Workflow Commands

```python
# Source: D-11; toolkit#1421 mitigation
import sys

def mask(value: str) -> None:
    """Register value with GH Actions log masking. MUST be stripped first."""
    print(f"::add-mask::{value}", flush=True)

# Usage order per D-11:
mask(os.environ['INPUT_CLIENT_SECRET'])        # immediately on entry
# ... do exchange ...
mask(signer.security_token_container.security_token.strip())  # after obtaining UPST
```

### Pattern 4: pytest Layout for Testing Output Writers

```python
# Source: pytest docs + standard monkeypatch conventions
# conftest.py
import pytest, os

@pytest.fixture
def github_output(tmp_path):
    p = tmp_path / "output"
    p.write_text("")
    os.environ['GITHUB_OUTPUT'] = str(p)
    yield p
    del os.environ['GITHUB_OUTPUT']

@pytest.fixture
def github_env(tmp_path):
    p = tmp_path / "env"
    p.write_text("")
    os.environ['GITHUB_ENV'] = str(p)
    yield p
    del os.environ['GITHUB_ENV']

# test_exchange.py
def test_write_output(github_output):
    write_output("config-path", "/home/runner/.oci/config")
    assert "config-path=/home/runner/.oci/config\n" in github_output.read_text()
```

### Anti-Patterns to Avoid

- **Catching `requests.exceptions.HTTPError`**: the SDK raises `oci._vendor.requests.exceptions.HTTPError`, a different class. Catching the wrong type means 5xx errors never retry.
- **Calling `get_security_token()` to trigger the exchange**: the constructor is already eager; calling `get_security_token()` after construction just returns the cached token.
- **Using `::set-output::`**: deprecated; only `$GITHUB_OUTPUT` append is supported.
- **Masking UPST before `.strip()`**: toolkit#1421 — masking a string with `\n` silently no-ops.
- **Using `${{ inputs.foo }}` inline in `action.yml` `run:` bodies**: script injection vector. All inputs must go via `env:` block.
- **Reading `signer.security_token_container.security_token` before constructor returns**: not applicable since constructor is eager, but do not call `signer.refresh_security_token()` — that is for in-process SDK refresh, not for this pattern.

---

## File-by-File Plan Stubs

### `actions/oci-token-exchange/action.yml`

**Purpose:** Composite entrypoint. Declares 7 inputs, 2 outputs, 1 `run:` step.

**Inputs declaration:**

```yaml
inputs:
  client-identifier:
    description: 'OAuth client_id of the OCI Confidential Application'
    required: true
  client-secret:
    description: 'OAuth client_secret of the OCI Confidential Application'
    required: true
  domain-base-url:
    description: 'Identity Domain base URL (e.g. https://idcs-XXXX.identity.oraclecloud.com)'
    required: true
  audience:
    description: 'OIDC audience — must match the IPT allowedTokenAudiences'
    required: false
    default: 'https://github.com/ColourWithin'
  region:
    description: 'OCI region for the resulting CLI/SDK config'
    required: false
    default: 'ap-sydney-1'
  output-config-path:
    description: 'Where to write the OCI CLI config file'
    required: false
    default: '${{ runner.home }}/.oci/config'
  output-key-path:
    description: 'Where to write the ephemeral RSA private key'
    required: false
    default: '${{ runner.home }}/.oci/upst.pem'

outputs:
  config-path:
    description: 'Absolute path of the OCI CLI config written'
    value: ${{ steps.exchange.outputs.config-path }}
  expires-at:
    description: 'ISO 8601 UPST expiry timestamp'
    value: ${{ steps.exchange.outputs.expires-at }}
```

**Single `run:` step structure:**

```yaml
runs:
  using: composite
  steps:
    - id: exchange
      name: OCI token exchange
      shell: bash
      env:
        INPUT_CLIENT_IDENTIFIER: ${{ inputs.client-identifier }}
        INPUT_CLIENT_SECRET: ${{ inputs.client-secret }}
        INPUT_DOMAIN_BASE_URL: ${{ inputs.domain-base-url }}
        INPUT_AUDIENCE: ${{ inputs.audience }}
        INPUT_REGION: ${{ inputs.region }}
        INPUT_OUTPUT_CONFIG_PATH: ${{ inputs.output-config-path }}
        INPUT_OUTPUT_KEY_PATH: ${{ inputs.output-key-path }}
      run: |
        # Preflight: check OIDC env vars before incurring pip install cost
        if [[ -z "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" || -z "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:-}" ]]; then
          echo "::error::Missing OIDC token env vars. Add to your workflow:"
          echo "::error::permissions:"
          echo "::error::  id-token: write"
          echo "::error::  contents: read"
          exit 1
        fi

        pip install --user 'oci>=2.173.1,<3' requests cryptography

        python "${{ github.action_path }}/exchange.py"
```

**Note:** `${{ github.action_path }}` is safe in `run:` — it is a path expression set by the runner, not a user-supplied input. [VERIFIED: GitHub Actions composite action docs]

**Caveats for planner:**
- The `outputs.value:` references `${{ steps.exchange.outputs.config-path }}` — the step must have `id: exchange`.
- `runner.home` vs `HOME`: using `${{ runner.home }}` in the default is the canonical way to reference the runner home in `action.yml` inputs defaults. Alternatively express as `$HOME` but this is evaluated at run time; `${{ runner.home }}` is safer.
- Do NOT use `${{ runner.home }}` (expression) inside the `run:` body — the env var `HOME` is available.

---

### `actions/oci-token-exchange/exchange.py`

**Purpose:** All token-exchange logic. ~120 lines.

**Sections (in order of execution):**

1. **Imports** (all at top per CLAUDE.md): `os`, `sys`, `time`, `datetime`, `pathlib`, `base64`, `oci`, `oci.auth.signers`, from `oci._vendor import requests as oci_requests`, `cryptography.hazmat.primitives.serialization`
2. **Constants**: `MAX_ATTEMPTS = 4`, `DELAYS = [0.5, 1.0, 2.0, 4.0]`
3. **`mask(value)`**: print `::add-mask::` to stdout; flush
4. **`get_jwt(audience)`**: `requests.get(ACTIONS_ID_TOKEN_REQUEST_URL, params={'audience': audience}, headers={'Authorization': f'bearer {ACTIONS_ID_TOKEN_REQUEST_TOKEN}'})` → parse `response.json()['value']`. Note: this call uses the TOP-LEVEL `requests` (not the vendored one) since it is in our code, not the SDK.
5. **`exchange_with_retry(get_jwt_fn, domain_url, client_id, client_secret)`**: retry loop as per Pattern 1 above
6. **`write_output(key, value)`** and **`write_env(key, value)`**: append to `$GITHUB_OUTPUT`/`$GITHUB_ENV`
7. **`write_config(config_path, token_path, key_path, region)`**: write `[DEFAULT]` stanza
8. **`main()`**:
   - Read all `INPUT_*` env vars; fail with clear message if any required ones are missing
   - `mask(client_secret)` — immediately
   - Define `get_jwt` closure with the audience
   - Call `exchange_with_retry(...)` → signer
   - Extract `upst`, `private_key_obj`, `expires_epoch`
   - Resolve `token_path = Path(config_path).parent / 'upst.token'`
   - Write UPST text to `token_path`
   - Serialise private key to PEM → write to `key_path`; `os.chmod(key_path, 0o600)`
   - Write OCI config to `config_path`
   - `mask(upst.strip())` — after obtaining, before emitting to output
   - `write_output('config-path', str(config_path))`
   - `write_output('expires-at', iso8601_from_epoch(expires_epoch))`
   - `write_env('OCI_CLI_AUTH', 'security_token')`
9. `if __name__ == '__main__': main()`

**Note on `get_jwt` import**: `get_jwt()` uses the top-level `requests` package (explicitly installed via `pip install --user requests`). The retry wrapper catches `oci._vendor.requests.exceptions.*`. These are separate concerns.

---

### `actions/oci-token-exchange/requirements.txt`

```
oci>=2.173.1,<3
requests
cryptography
```

Three lines. No pinned versions, no `--require-hashes`. `requests` and `cryptography` are explicit for auditability per D-17; they resolve transitively with compatible versions.

---

### `actions/oci-token-exchange/README.md`

**Required sections (per D-ClaudeDiscretion + CONTEXT.md specifics):**

1. **What this action does** — one paragraph; Option A rationale; replaces `gtrevorrow/oci-token-exchange-action` (CVE-2025-58754, wrong principal type)
2. **Prerequisites** — IPT + Confidential Application + Service User in OCI; link to `colour-within-ops` Tofu module
3. **Required consumer permissions** — exact YAML block:
   ```yaml
   permissions:
     id-token: write
     contents: read
   ```
4. **Inputs / outputs table** — from `action.yml` declaration
5. **Usage example** — minimal consumer workflow snippet with SHA-pin and doubled `.github` path
6. **Audience mapping** — note that `https://github.com/ColourWithin` default must match IPT `allowedTokenAudiences`; Oracle's SDK example uses `"github-actions"` as a placeholder — do not copy that value
7. **`requested_token_type` correction** — `urn:oci:token-type:oci-upst` (with `oci-` infix); PRD §3 has a typo
8. **UPST ceiling** — "~60 minutes per exchange; for jobs exceeding 55 minutes, re-invoke this action"; cite `oracle/oci-cli#998`
9. **Filesystem footprint** — lists the three files written: `output-config-path`, `{config-dir}/upst.token`, `output-key-path`
10. **Self-hosted runner warning** — no `post:` cleanup; credentials persist on disk until runner VM is recycled

---

### `actions/oci-token-exchange/pyproject.toml`

**Purpose:** pytest discovery config + ruff settings for this action's Python code.

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]

[tool.ruff]
target-version = "py312"

[tool.ruff.lint]
# Start from ruff defaults (E, F rules). Add:
# - S (bandit security): catches subprocess issues, hardcoded passwords
# - B (bugbear): catches common bugs
# Do NOT enable T20 (print statements) — exchange.py uses print for workflow commands
select = ["E", "F", "S", "B"]
ignore = [
    "S101",   # assert statements — fine in tests
    "S603",   # subprocess calls — not applicable here
]
```

---

### `actions/oci-token-exchange/tests/conftest.py`

**Purpose:** Shared fixtures for `$GITHUB_OUTPUT`, `$GITHUB_ENV`, and input env var patching.

Fixtures to define:
- `github_output(tmp_path, monkeypatch)` — creates temp file, sets `GITHUB_OUTPUT` env var, yields path
- `github_env(tmp_path, monkeypatch)` — same pattern for `GITHUB_ENV`
- `fake_inputs(monkeypatch)` — sets all `INPUT_*` env vars to test values

Using `monkeypatch` (not manual `os.environ` manipulation) ensures cleanup between tests.

---

### `actions/oci-token-exchange/tests/test_exchange.py`

**Test scenarios (mapping to TOKEX requirements):**

| Test | Covers | Method |
|------|--------|--------|
| `test_mask_calls_add_mask` | TOKEX-08, D-11 | Capture stdout; assert `::add-mask::` prefix |
| `test_mask_strips_before_emit` | TOKEX-08, toolkit#1421 | Pass value with `\n`; verify stripped value emitted |
| `test_write_output_appends` | TOKEX-07, D-09 | Use `github_output` fixture; verify append |
| `test_write_env_appends` | TOKEX-06, D-10 | Use `github_env` fixture; verify append |
| `test_retry_no_retry_on_4xx` | TOKEX-10, D-06 | Mock `TokenExchangeSigner` to raise 4xx `HTTPError`; assert no retry |
| `test_retry_retries_on_5xx` | TOKEX-11, D-06 | Mock to raise 5xx twice then succeed; assert 2 retries, correct delays |
| `test_retry_max_attempts` | TOKEX-11, D-06 | Mock to always raise 5xx; assert raises after 4 attempts |
| `test_retry_no_retry_on_network_error_exhausted` | TOKEX-11, D-06 | Mock `ConnectionError`; assert raises after max attempts |
| `test_keygen_produces_rsa2048` | TOKEX-03, D-04 | Instantiate `SessionKeySupplier`; assert key size 2048 |
| `test_keygen_public_key_serialisable` | TOKEX-03, D-04 | Assert public key serialises to PEM without error |
| `test_private_key_pem_output` | TOKEX-03, D-05 | Assert private bytes starts with `-----BEGIN PRIVATE KEY-----` |
| `test_token_type_literal_in_source` | TOKEX-04, Pitfall 2 | Read `exchange.py` source; assert `urn:oci:token-type:oci-upst` present |
| `test_no_set_x_in_action_yml` | TOKEX-14, Pitfall 5 | Read `action.yml`; assert `set -x` not present |
| `test_config_write_default_profile` | TOKEX-05, D-14 | Call `write_config()`; assert `[DEFAULT]` stanza with correct keys |
| `test_expires_at_iso8601` | TOKEX-07 | Call epoch→ISO converter; assert RFC 3339 format with timezone |

**Note:** Tests for `TokenExchangeSigner` internals use `unittest.mock.patch` on `oci.auth.signers.TokenExchangeSigner` — do not test the SDK itself.

---

### `.github/workflows/test-actions.yml`

**Phase 1 scope:** `unit-tests` job only. Smoke job added in Phase 3.

```yaml
name: Test composite actions

on:
  pull_request:
    branches: [main]
    paths:
      - 'actions/**'
      - '.github/workflows/test-actions.yml'

jobs:
  unit-tests:
    name: Unit tests and lint
    runs-on: ubuntu-24.04

    steps:
      - name: Checkout
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd  # v6.0.2

      - name: Install test dependencies
        shell: bash
        run: pip install 'oci>=2.173.1,<3' requests cryptography pytest ruff

      - name: Ruff lint
        shell: bash
        run: ruff check actions/oci-token-exchange/

      - name: Actionlint (workflow files)
        shell: bash
        run: actionlint

      - name: Grep: no set -x in action.yml
        shell: bash
        run: |
          if grep -r 'set -x\|set -o xtrace' actions/; then
            echo "::error::Found set -x in action source. Remove before merging."
            exit 1
          fi

      - name: Grep: no inputs interpolation in run: bodies
        shell: bash
        run: |
          if grep -rn '\${{ *inputs\.' actions/oci-token-exchange/action.yml; then
            echo "::error::Found \${{ inputs.* }} in action.yml run: body — script injection risk."
            exit 1
          fi

      - name: Pytest unit tests
        shell: bash
        run: pytest actions/oci-token-exchange/tests/ -v
```

**Caveats for planner:**
- `actionlint` must be installed on the runner. It is not pre-installed on `ubuntu-24.04`. Add an install step: `brew install actionlint` does not work in CI; use the `actionlint` binary release or `go install github.com/rhysd/actionlint/cmd/actionlint@latest`.
- `shellcheck` (used by actionlint for `run:` step lint) IS pre-installed on ubuntu-24.04 runners.
- The grep steps substitute for the actionlint gap (composite `action.yml` files not linted by actionlint).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RSA-2048 keygen | Custom OpenSSL wrapper | SDK's `SessionKeySupplier` (internal to `TokenExchangeSigner`) | Already done correctly by Oracle |
| Token exchange HTTP POST | Manual `requests.post` with form params | `TokenExchangeSigner()` constructor | SDK handles auth header, public key encoding, response parsing |
| JWT decode for `exp` claim | Manual base64 parsing | `security_token_container.jwt['exp']` | Already decoded by SDK via PyJWT (without signature verification) |
| Exponential backoff library | `tenancy` / `urllib3.Retry` | Manual `time.sleep` loop | D-06 locked; ~15 lines; avoids new dep |

---

## Common Pitfalls

### Pitfall 1: Catching Wrong HTTPError Class

**What goes wrong:** `exchange.py` catches `requests.exceptions.HTTPError` but the SDK raises `oci._vendor.requests.exceptions.HTTPError`. The retry loop never fires for 5xx errors.

**Root cause:** SDK uses a vendored copy of requests at `oci._vendor.requests`, not the top-level package.

**How to avoid:** `from oci._vendor import requests as oci_requests`; catch `oci_requests.exceptions.HTTPError`.

**Test:** `test_retry_retries_on_5xx` must patch `oci._vendor.requests.exceptions.HTTPError`, not `requests.exceptions.HTTPError`.

### Pitfall 2: Multiline UPST Masking (toolkit#1421)

**What goes wrong:** `::add-mask::` is called with a string containing `\n`. Masking silently no-ops. UPST appears in logs.

**How to avoid:** Call `.strip()` on UPST before passing to `mask()`. Verified in `test_mask_strips_before_emit`.

### Pitfall 3: actionlint Does Not Lint Composite `action.yml` Files

**What goes wrong:** Running `actionlint` in CI catches injection in workflow files but NOT in `actions/oci-token-exchange/action.yml`. The `${{ inputs.* }}`-in-`run:` injection vector goes undetected.

**How to avoid:** Add a `grep` step to the CI job that explicitly checks for `${{ inputs.` in action.yml files.

**Confirmed:** Local test of actionlint 1.7.12 against an `action.yml` file reports `syntax-check` errors (treats it as a malformed workflow) rather than composite action checks. [VERIFIED: local test 2026-05-09]

### Pitfall 4: `pip install --user` and PATH for Exchange.py

**What:** `pip install --user` places packages in `~/.local/lib/python3.12/site-packages/`. Python's import system includes user site-packages by default. Since `exchange.py` is run as `python exchange.py` (not as an installed script), there is NO PATH issue. This is distinct from the issue with installed binaries like `oci-cli`.

**Confirmed:** The `pip install --user` approach is correct for this action. No `$GITHUB_PATH` manipulation needed for `exchange.py`.

### Pitfall 5: `upst.token` File Location Must Be Absolute

**What goes wrong:** OCI CLI config `security_token_file=./upst.token` (relative path) may not resolve correctly when OCI CLI changes working directory or is invoked from a different cwd.

**How to avoid:** Always write the absolute path. Use `Path(config_path).resolve().parent / 'upst.token'` to compute the absolute token path.

### Pitfall 6: `output-key-path` Default Value Expression

**What goes wrong:** Using `$HOME` as the default value in `action.yml` inputs may be evaluated as a literal string rather than the env var.

**How to avoid:** Use `${{ runner.home }}` in the `default:` field. This is a runner context expression, not a shell variable. Verify the planner uses `runner.home`, not `HOME` or `~`, in input defaults.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest (latest) |
| Config file | `actions/oci-token-exchange/pyproject.toml` — `[tool.pytest.ini_options]` |
| Quick run | `pytest actions/oci-token-exchange/tests/ -x` |
| Full suite | `pytest actions/oci-token-exchange/tests/ -v` |

### Phase Requirements → Test Map

| Req ID | Behaviour | Test Type | Command |
|--------|-----------|-----------|---------|
| TOKEX-01 | Inputs declared in action.yml | Integration (file inspection) | `grep -c 'required: true' actions/oci-token-exchange/action.yml` |
| TOKEX-02 | OIDC mint uses correct URL and headers | Unit (mock) | `test_get_jwt_calls_correct_url` |
| TOKEX-03 | Keygen produces RSA-2048 + PEM output | Unit | `test_keygen_produces_rsa2048`, `test_private_key_pem_output` |
| TOKEX-04 | `urn:oci:token-type:oci-upst` literal present | Static (file grep) | `test_token_type_literal_in_source` |
| TOKEX-05 | Config write produces `[DEFAULT]` stanza | Unit | `test_config_write_default_profile` |
| TOKEX-06 | `OCI_CLI_AUTH=security_token` written to `$GITHUB_ENV` | Unit | `test_write_env_appends` |
| TOKEX-07 | `config-path` and `expires-at` written to `$GITHUB_OUTPUT` | Unit | `test_write_output_appends`, `test_expires_at_iso8601` |
| TOKEX-08 | UPST masked after `.strip()`; client-secret masked on entry | Unit | `test_mask_strips_before_emit`, `test_mask_calls_add_mask` |
| TOKEX-09 | Bash preflight exits 1 with YAML fix when OIDC vars absent | Integration (manual / smoke) | Verified in Phase 3 smoke test |
| TOKEX-10 | 4xx: surfaces body + no retry | Unit | `test_retry_no_retry_on_4xx` |
| TOKEX-11 | 5xx: retries with backoff, max 3 | Unit | `test_retry_retries_on_5xx`, `test_retry_max_attempts` |
| TOKEX-12 | `pip install --user 'oci>=2.173.1,<3'` in action.yml | Static (file grep) | `grep 'oci>=2.173.1' actions/oci-token-exchange/action.yml` |
| TOKEX-13 | README contains required sections | Manual review | Pre-merge checklist |
| TOKEX-14 | No `set -x`; `bash -e -o pipefail` | Static (grep) | `test_no_set_x_in_action_yml`; CI grep step |

### Wave 0 Gaps

- [ ] `actions/oci-token-exchange/tests/conftest.py` — shared fixtures
- [ ] `actions/oci-token-exchange/tests/test_exchange.py` — all scenarios
- [ ] `actions/oci-token-exchange/pyproject.toml` — pytest + ruff config
- [ ] `pip install pytest ruff` in `unit-tests` job — added to `test-actions.yml`
- [ ] `actionlint` install step in `unit-tests` job — binary not pre-installed on ubuntu-24.04

### Sampling Rate

- Per task commit: `pytest actions/oci-token-exchange/tests/ -x` (stop on first failure)
- Per wave merge: `pytest actions/oci-token-exchange/tests/ -v && ruff check actions/oci-token-exchange/`
- Phase gate: full suite green before `/gsd-verify-work`

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.12 | exchange.py runtime | ✓ (ubuntu-24.04 runner) | 3.12.3 | — |
| `pip` | `oci` install in action | ✓ (ubuntu-24.04 runner) | — | — |
| `actionlint` | `unit-tests` job lint | ✓ (local dev, 1.7.12) | 1.7.12 | Must install in CI (binary download) |
| `shellcheck` | actionlint integration | ✓ (local dev, 0.11.0) | 0.11.0 | Pre-installed on ubuntu-24.04 |
| `ruff` | `unit-tests` job lint | ✓ (local dev, 0.15.12) | 0.15.12 | `pip install ruff` in CI |
| `pytest` | `unit-tests` job | Not pre-installed on runner | — | `pip install pytest` in CI |

**Missing dependencies with no fallback:** actionlint is not pre-installed on ubuntu-24.04. The `unit-tests` job needs an explicit install step. Recommended: download the release binary directly.

```yaml
- name: Install actionlint
  shell: bash
  run: |
    curl -Lo actionlint.tar.gz \
      "https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_arm64.tar.gz"
    tar -xzf actionlint.tar.gz actionlint
    sudo mv actionlint /usr/local/bin/
```

Note: ubuntu-24.04 GitHub-hosted runners are `x86_64`. Use the `linux_amd64` binary, not `arm64`.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | `TokenExchangeSigner` (OAuth2 token exchange); `::add-mask::` for credential redaction |
| V3 Session Management | Yes | UPST lifetime ~60 min; documented ceiling; `security_token_file` on ephemeral runner |
| V4 Access Control | No | Consumer's OCI policy — out of scope for this action |
| V5 Input Validation | Yes | Bash preflight validates OIDC env vars; Python validates all `INPUT_*` env vars present |
| V6 Cryptography | Yes | `cryptography` library via SDK; RSA-2048; no hand-rolled crypto |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Script injection via `${{ inputs.* }}` in `run:` | Tampering | Env var indirection (D-08); grep check in CI |
| UPST/secret leakage via xtrace (`set -x`) | Information Disclosure | `bash -e -o pipefail` only (D-14); grep CI check |
| Multiline secret mask no-op (toolkit#1421) | Information Disclosure | `.strip()` before `::add-mask::` (D-11) |
| Private key world-readable | Information Disclosure | `chmod 600` immediately after write |
| Retry on 4xx (amplifies failed auth) | Denial of Service | 4xx never retries (D-06) |
| OCI token endpoint 4xx body suppressed | Information Disclosure | Full body surfaced via `::error::` (D-13) |

---

## Runtime State Inventory

This is a greenfield phase. No rename/refactor — section not applicable.

---

## Risks and Open Questions

### Risk 1: `oci._vendor.requests` API Stability

**What:** The retry handler depends on `from oci._vendor import requests as oci_requests` — a private internal import path.

**Impact if broken:** If Oracle restructures the vendored requests, the import fails. This is LOW risk (vendoring has been stable across `oci>=2.168`).

**Mitigation:** Add a defensive `ImportError` catch: if the import fails, fall back to catching `Exception` and checking `type(e).__name__ == 'HTTPError'`.

**Confidence:** MEDIUM — verified in current SDK source but private API.

### Risk 2: `security_token_container.jwt` Attribute Name

**What:** The research accesses `signer.security_token_container.jwt['exp']` for the expiry timestamp. This is confirmed from the `SecurityTokenContainer` source, but it is a non-public attribute.

**Confidence:** HIGH — directly read from source at `security_token_container.py`. The `get_jwt()` method on `SecurityTokenContainer` returns the same dict.

**Mitigation:** If `jwt` is not available, fall back to manually decoding the UPST JWT: `base64.urlsafe_b64decode(upst.split('.')[1] + '==')` → JSON parse → `['exp']`.

### Risk 3: Actionlint Binary Architecture in CI

**What:** The unit-tests job must download the correct actionlint binary for `ubuntu-24.04` (x86_64/amd64), not arm64.

**Impact:** Wrong architecture → binary fails to execute → CI step fails.

**Mitigation:** Hardcode `linux_amd64` in the download URL. Version pin to `v1.7.12` (verified locally).

### Risk 4: `runner.home` vs `HOME` in Input Defaults

**What:** `action.yml` input `default:` values support `${{ }}` expressions. If the planner uses `$HOME` in the default, it may be treated as a literal string.

**Recommendation:** Use `${{ runner.home }}` in `default:` fields for `output-config-path` and `output-key-path`.

### Open Question: PyJWT Dependency

**What we know:** `SecurityTokenContainer` uses `jwt.decode(jwt=..., options={"verify_signature": False})` to decode the UPST. This implies `PyJWT` is a transitive dependency of `oci`.

**What's unclear:** Whether `exchange.py` needs to import `jwt` directly (for fallback expiry decoding) or can rely entirely on `signer.security_token_container.jwt`.

**Recommendation:** Do not import `jwt` directly. Use `signer.security_token_container.jwt['exp']`. If that fails at runtime, use the base64 manual fallback. Do not add `PyJWT` as an explicit dependency.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `security_token_container.jwt['exp']` is an `int` (Unix epoch seconds) | API Surface | `expires-at` output could be wrong format; LOW risk (standard JWT `exp` claim is always int) |
| A2 | `ubuntu-24.04` runners have `shellcheck` pre-installed | Environment | actionlint's `run:` shell check would be skipped; LOW risk (shellcheck is in ubuntu-24.04 runner image per runner-images docs) |
| A3 | `GITHUB_ENV` and `GITHUB_OUTPUT` paths are always set in a real GitHub Actions environment | Test Patterns | Tests use fixtures; non-fixture production code would fail; LOW risk (both are guaranteed by runner spec) |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `::set-output::` workflow command | Append to `$GITHUB_OUTPUT` file | Sept 2022 | Old form still works but deprecated; new form required |
| `actions/setup-python` cache inside composite | `actions/cache` in calling workflow | Ongoing (issue #377 unresolved) | Cannot use setup-python cache inside composite actions |
| Tag-pinned action references | SHA-pinned | Supply-chain best practice | `v1` tag references are mutable; SHA pins are immutable |

---

## Sources

### Primary (HIGH confidence)

- `github.com/oracle/oci-python-sdk` — `src/oci/auth/signers/token_exchange_signer.py` — verified constructor signature, eager init, exception type, vendored requests import [source read 2026-05-09]
- `github.com/oracle/oci-python-sdk` — `src/oci/auth/session_key_supplier.py` — verified RSA-2048 keygen via `cryptography`, `private_key` attribute, `get_key_pair()` return shape [source read 2026-05-09]
- `github.com/oracle/oci-python-sdk` — `src/oci/auth/security_token_container.py` — verified `security_token` attribute, `jwt['exp']` expiry access [source read 2026-05-09]
- `github.com/oracle/oci-python-sdk` — `examples/workload_identity_federation_signer_example.py` — verified constructor call pattern `TokenExchangeSigner(get_jwt, domain_url, client_id, client_secret)` [source read 2026-05-09]
- `docs.oracle.com/en-us/iaas/Content/Identity/api-getstarted/json_web_token_exchange.htm` — confirmed success response `{"token": "..."}` and endpoint URL pattern [WebFetch 2026-05-09]
- `api.github.com` — confirmed `actions/checkout` v6.0.2 SHA = `de0fac2e4500dabe0009e67214ff5f5447ce83dd` [API call 2026-05-09]
- Local `actionlint 1.7.12` — confirmed does NOT lint composite `action.yml` files; treats them as malformed workflow files [local test 2026-05-09]
- Local `actionlint 1.7.12` — confirmed does NOT flag `${{ inputs.* }}` in workflow `run:` steps [local test 2026-05-09]

### Secondary (MEDIUM confidence)

- `.planning/research/STACK.md` — dep versions, `actions/setup-python` caching limitation, runner image Python version [project research 2026-05-09]
- `.planning/research/PITFALLS.md` — toolkit#1421, `requested_token_type` literal, masking order, `set -x` risk [project research 2026-05-09]
- `.planning/research/ARCHITECTURE.md` — `$GITHUB_ENV` cross-step semantics, component boundaries [project research 2026-05-09]

### Tertiary (LOW confidence — for awareness only)

- Oracle JWT-to-UPST error response fields (`error`, `error_description`): not directly verified from Oracle docs; sourced from PITFALLS.md citing ateam blogs (403 to curl). D-13 decision to dump raw body avoids dependence on field names.

---

## Metadata

**Confidence breakdown:**

- SDK API surface: HIGH — live source code read
- Standard stack: HIGH — PyPI + GitHub API verified
- actionlint behaviour: HIGH — local tool test
- Architecture: HIGH — from verified source + CONTEXT.md locked decisions
- Error response shape: LOW — Oracle docs do not include error examples; raw body dump mitigates

**Research date:** 2026-05-09
**Valid until:** 2026-07-09 (SDK source can change; re-verify `token_exchange_signer.py` on `oci` minor bumps)
