# Stack Research

**Domain:** GitHub composite actions — OCI OIDC token exchange + CLI wrapper
**Researched:** 2026-05-09
**Confidence:** HIGH (all versions confirmed from PyPI and GitHub API; architecture constraints verified from GitHub Actions runner images and setup-python issue tracker)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `oci` (Python SDK) | `>=2.173.1,<3` | `TokenExchangeSigner` for OIDC→UPST exchange | Oracle first-party SDK; `TokenExchangeSigner` is the reference implementation for GitHub Actions IPT exchange; pure-Python wheel (`py3` tag), works on any Python 3.x; `<3` guards against major-version break |
| `oci-cli` (pip package) | `>=3.81.1` (latest) | Provides the `oci` binary used by Action 2 | pip-installable; `>=3.6` Python requirement; NOT pre-installed on ubuntu-24.04 runners — must be installed explicitly |
| Python | `3.12` (pin to runner default) | Runtime for Action 1 exchange script | ubuntu-24.04 pre-installs Python 3.12.3; no `setup-python` step needed for Action 1 when pinned to runner default; avoids cold-start cost of downloading a different interpreter |
| `actions/checkout` | `v6.0.2` @ `de0fac2e4500dabe0009e67214ff5f5447ce83dd` | Checks out the `.github` repo for `test-actions.yml` smoke test | Required for the smoke test workflow; v6 is current (2026-01-09) |
| `actions/setup-python` | `v6.2.0` @ `a309ff8b426b58ec0e2a45f0f869d46889d02405` | Optional Python setup + pip caching in smoke test | v6.2.0 is current (2026-01-22); use only in `test-actions.yml`, NOT inside the composite actions themselves (see Caching Constraint below) |
| `actions/cache` | `v5.0.5` @ `27d5ce7f107fe9357f9df03efb73ab90386fccae` | Manual pip cache for oci-cli across smoke test runs | v5.0.5 is current (2026-04-13); preferred over `setup-python`'s built-in cache for composite-action contexts |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `cryptography` | `>=3.2.1,<47` (resolved transitively by `oci`) | RSA-2048 keypair generation for UPST session key | Transitive dep of `oci`; do not pin directly in `requirements.txt` — let `oci` constrain it |
| `urllib3` | `>=2.6.3` (Python ≥3.10) or `==1.26.20` (Python <3.10) | HTTP for token endpoint requests | Resolved transitively by `oci`; version depends on Python runtime — this is why pinning Python 3.12 matters |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `shellcheck` | Lint shell steps in composite action YAMLs | Run via `uses: ludeeus/action-shellcheck` or local `brew install shellcheck`; catches quoting bugs in Action 2's bash steps before they hit OCI |
| `actionlint` | Lint `action.yml` and workflow YAML syntax | `brew install actionlint` locally; no official Actions wrapper needed — run in `test-actions.yml` as a `run:` step |

---

## Installation

### `actions/oci-token-exchange/requirements.txt`

```
oci>=2.173.1,<3
```

No other direct deps. `cryptography`, `urllib3`, `pyOpenSSL`, `python-dateutil`, `pytz`, `circuitbreaker`, and `certifi` are all resolved transitively. Do not pin them — they constrain themselves relative to `oci`'s declared ranges.

### `action.yml` — Action 1 install step

```yaml
- name: Install OCI Python SDK
  shell: bash
  run: pip install --user "oci>=2.173.1,<3"
```

No `actions/setup-python` step inside the composite action. Use the runner's pre-installed Python 3.12.3 directly. Reason: the composite-action `cache-dependency-path` restriction in `actions/setup-python` (issue #377) prevents its built-in pip cache from resolving paths inside `_actions/` directories — using the cache there requires a separate `actions/cache` step pointed at `~/.local/lib/python3.12/site-packages/` or the pip cache directory, which adds complexity for minimal gain on a ~5s install.

### `action.yml` — Action 2 install step

```yaml
- name: Install OCI CLI
  shell: bash
  run: pip install --user "oci-cli>=3.81.1"
```

Action 2 must install `oci-cli` itself if not already present (mirror the oracle-actions sentinel-file pattern: check `~/.oci-cli-installed` before installing to avoid reinstalling on repeated steps in the same job).

### `workflows/test-actions.yml` — pip caching via actions/cache

```yaml
- name: Restore pip cache
  uses: actions/cache@27d5ce7f107fe9357f9df03efb73ab90386fccae  # v5.0.5
  with:
    path: ~/.cache/pip
    key: ${{ runner.os }}-pip-oci-${{ hashFiles('actions/oci-token-exchange/requirements.txt') }}
    restore-keys: |
      ${{ runner.os }}-pip-oci-
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `pip install oci` (SDK only for Action 1) | `pip install oci-cli` for Action 1 | Never — `oci-cli` bundles a different version of `oci` SDK internally and can conflict; use SDK directly for `TokenExchangeSigner` |
| Runner default Python 3.12 (no `setup-python`) | `actions/setup-python` inside Action 1 | Only if future oci SDK drops 3.12 support or a specific 3.13+ feature is needed; adds cold-start and is blocked by caching constraint |
| `actions/cache` manual cache in test workflow | `setup-python`'s `cache: pip` input in composite | `setup-python` pip cache is broken inside composite actions (issue #377, open, no resolution); `actions/cache` manual approach is reliable |
| `oci-cli` via pip (`pip install oci-cli`) | Oracle's bash installer (`curl -L ... | bash`) | pip is faster, produces a deterministic version, and integrates with pip caching; the bash installer is slower and harder to pin |
| Composite (`runs.using: composite`) | Node.js (`runs.using: node20`) | Node is valid for Action 1 only if using `@actions/core.getIDToken()` directly; the PRD Decision log chose composite + Python over Node to keep Oracle's first-party reference pattern |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `gtrevorrow/oci-token-exchange-action` | Unmaintained; ships `axios < 1.8.1` (CVE-2025-58754); produces `principal.type = 'user'` (wrong) not `'workload'` | This repo's `actions/oci-token-exchange` |
| `oracle-actions/run-oci-cli-command` | No substantive commits since Nov–Dec 2024; original author has no Oracle org access; stale Node deps | This repo's `actions/run-oci-cli-command` |
| `@actions/core` (npm) inside Action 1 | PRD Decision: composite + Python chosen over Node; mixing Node toolchain adds `package.json`, build step, and `dist/` bundling overhead to what should be a simple script | Composite steps + Python; use `ACTIONS_ID_TOKEN_REQUEST_URL` env var directly from bash/Python |
| Pinning exact `oci` patch version | Defeats the point of `<3` upper bound; prevents security fixes from landing automatically | `>=2.173.1,<3` range |
| Omitting `<3` upper bound | OCI SDK major version bump could introduce breaking changes silently | Always include `<3` |
| `actions/setup-python` cache inside composite action | Cache resolution fails — action looks for `cache-dependency-path` relative to workspace, but composite action files live in `_actions/` dir outside workspace (issue #377, unresolved) | `actions/cache` with explicit `path: ~/.cache/pip` in the calling workflow |

---

## Stack Patterns by Variant

**Action 1 (`oci-token-exchange`) — composite + Python:**
- Python runtime: ubuntu-24.04 runner default (3.12.3), no `setup-python` step
- SDK: `pip install --user "oci>=2.173.1,<3"` as a composite step
- Script: `exchange.py` using `oci.auth.signers.TokenExchangeSigner`
- Secret masking: write UPST and `client-secret` to `$GITHUB_OUTPUT` via `core::add-mask::` workflow command (composite equivalent of `core.setSecret`)
- OCI CLI config written via Python's `configparser` or direct file write

**Action 2 (`run-oci-cli-command`) — composite + bash only:**
- No Python needed in the action itself
- `oci-cli` must be installed by a prior step (either Action 1 installs it, or Action 2 checks and installs it)
- Decision: Action 2 should install `oci-cli` itself (sentinel file pattern) so it is independently usable without requiring Action 1 as a prerequisite
- All logic in `run:` steps with `shell: bash`

**Smoke test workflow (`test-actions.yml`):**
- `actions/checkout` to get repo content
- `actions/cache` for pip (not `setup-python` cache — see above)
- Calls Action 1 then Action 2 in sequence
- `permissions: { id-token: write, contents: read }` required at job level

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `oci>=2.173.1,<3` | Python 3.12 | `urllib3>=2.6.3` branch taken on Python ≥3.10; confirmed by `oci` 2.173.1 `requires_dist` |
| `oci-cli>=3.81.1` | Python ≥3.6 | Installs its own bundled `oci` copy internally; must not conflict with Action 1 if both run in the same job — they install to separate `site-packages` layers if using `--user` or venvs, but in practice they coexist on the runner PATH since `oci-cli` manages its own env |
| `actions/setup-python@v6.2.0` | `actions/cache@v5` | setup-python v6 moved to Node 24 internally (breaking change from v5 which used Node 20); no functional impact for composite-action callers |
| `actions/checkout@v6` | ubuntu-24.04 | v6 is current; v4 still works but no new fixes |

---

## Sources

- PyPI `oci` 2.173.1 — `requires_python`, `requires_dist`, wheel tags — HIGH confidence (direct API call)
- PyPI `oci-cli` 3.81.1 — `requires_python`, version — HIGH confidence (direct API call)
- GitHub API `actions/checkout` releases — tag v6.0.2, commit SHA `de0fac2e` — HIGH confidence (direct API call)
- GitHub API `actions/setup-python` releases — tag v6.2.0, commit SHA `a309ff8b` — HIGH confidence (direct API call)
- GitHub API `actions/cache` releases — tag v5.0.5, commit SHA `27d5ce7f` — HIGH confidence (direct API call)
- `actions/runner-images` Ubuntu2404-Readme.md — Python 3.12.3 pre-installed; OCI CLI NOT pre-installed; AWS/Azure/GCloud CLIs present — HIGH confidence (official runner image docs)
- `actions/setup-python` issue #377 — pip cache broken inside composite actions; open, no resolution — HIGH confidence (official repo issue)
- `oracle-actions/run-oci-cli-command` `src/main.ts` — installs via `python -m pip install oci-cli`; uses sentinel file `~/.oci-cli-installed` — HIGH confidence (direct source read)
- Oracle `workload_identity_federation_signer_example.py` — `TokenExchangeSigner` signature: `(get_jwt, oci_domain_url, oci_client_id, oci_client_secret)` — HIGH confidence (official Oracle SDK example)

---

*Stack research for: ColourWithin/.github composite actions (OCI token exchange + CLI wrapper)*
*Researched: 2026-05-09*
