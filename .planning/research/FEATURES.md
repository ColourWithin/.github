# Feature Research

**Domain:** GitHub composite actions — cloud OIDC token exchange and CLI wrapper
**Researched:** 2026-05-09
**Confidence:** HIGH (peer actions reviewed directly; OCI-specific behaviours verified against SDK source and OCI docs)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that any first-party cloud-auth action must ship. Missing one makes the action feel broken rather than incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| OIDC ID token minting | Core mechanism; every peer action does this as step 1 | LOW | `getIDToken(audience)` via `@actions/core` or curl against `ACTIONS_ID_TOKEN_REQUEST_URL`. Fail fast if `ACTIONS_ID_TOKEN_REQUEST_URL` is absent — this is the signal that `id-token: write` is missing. |
| Secret masking — UPST and client-secret | Consumers expect secrets to never appear in logs; peer actions (AWS, GCP, Vault) all mask immediately | LOW | Call `core.setSecret` on the UPST string and `client-secret` value before any other step that could echo them. Applies to both actions. |
| OCI CLI config file write | Expected by every OCI CLI and SDK invocation downstream | LOW | Write `[DEFAULT]` stanza with `security_token_file`, `key_file`, `region`. Set `OCI_CLI_AUTH=security_token` env var for the job. |
| `expires-at` output | Downstream steps may want to log or conditionally re-exchange | LOW | Parse `exp` claim from the UPST JWT (base64url-decode the payload). Emit as ISO 8601. |
| Clear `id-token: write` missing error | AWS, GCP, and Azure actions all check for this and surface a human-readable message | LOW | Check for `ACTIONS_ID_TOKEN_REQUEST_URL` being empty/absent; emit `core.setFailed` with exact YAML fix. Do not let it fail with a cryptic HTTP 401. |
| 4xx error surfaced verbatim | OCI token endpoint returns `error` + `error_description`; consumers need these to diagnose IPT misconfiguration | LOW | Parse JSON response body, emit both fields. Do not swallow or rewrite. |
| 5xx / transient retry with backoff | AWS action retries STS up to 12 times; GCP retries too; expected for cloud auth | LOW–MEDIUM | Exponential backoff, max 3 attempts, ~10s total. OCI token endpoint is reliable; 3 attempts is conservative and correct for a deploy workflow. |
| `oci --version` guard in run-oci-cli-command | Action 2 assumes the CLI is installed; silent failure confuses users | LOW | Check at action start; emit a helpful message pointing at `oracle-actions/install-oci-cli` or equivalent. |
| `bash -e -o pipefail` for CLI commands | Users expect non-zero OCI exits to fail the step | LOW | Composite bash step default. Capture stdout to `output` output; let stderr flow to log. |
| `exit-code` output | Callers occasionally need to inspect exit code rather than hard-fail | LOW | Capture before `set -e` propagates; emit as string. |
| Ephemeral RSA-2048 keypair generation | Required by OCI token-exchange grant shape — public key embedded in UPST request | MEDIUM | Use `oci.auth.signers.TokenExchangeSigner` (Option A) which handles this internally, or `openssl genrsa` + `openssl rsa -pubout` (Option B). Option A is the recommendation per PRD. |

### Differentiators (Nice-to-Have, Defer)

Features that would make this action stand out relative to the stale upstreams it replaces, but are not needed for v1 correctness.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `workload` principal type assertion | The action already fixes the `principal.type = 'workload'` bug from `gtrevorrow`; making this an explicit validation (assert the claim in the returned UPST) would make the fix visible | LOW | Decode the UPST JWT payload, assert `principal.type == 'workload'`, fail with a diagnostic if not. Zero external dependencies. Candidate for v1.1. |
| `expires-at` warning when token will expire during job | Long-running jobs (>55 min) may hit the 60-min UPST ceiling mid-job. A warning logged at auth time gives operators a heads-up | LOW | Compare `expires-at` against `github.run_started_at` + expected job duration. Hard to know duration upfront, so a fixed threshold warning ("expires in <10 min") may be more useful. |
| `output-config-path` / `output-key-path` inputs for non-default locations | Most jobs use `~/.oci/config`; some (multi-step, matrix) may write to custom paths | LOW | Already in the PRD spec as optional inputs with sensible defaults. Ship in v1. |
| `query` input on run-oci-cli-command | JMESPath `--query` is the most common post-processing operation on `oci` output; the oracle-actions upstream ships it | LOW | Already in PRD spec. Ship in v1. |
| `silent` input on run-oci-cli-command | Prevents echoing commands whose arguments contain user-visible secrets | LOW | Already in PRD spec. Ship in v1. |
| Automatic retry on OCI rate-limit (429) in run-oci-cli-command | OCI rate limits are rarely hit in deploy workflows; `run-oci-cli-command` is intentionally a thin wrapper | MEDIUM | The PRD explicitly defers this ("if we later want to add automatic retry..."). Defer to v1.x if rate-limit errors are observed in practice. |
| Post-job UPST file cleanup | GCP `auth` and AWS `configure-aws-credentials` clean up credentials after the job | HIGH | **Composite actions do not support native `post` steps** (confirmed; only JavaScript and Docker actions do). Implementing this requires a third-party action like `webiny/action-post-run` or switching to a JavaScript action. Not worth the complexity for v1 — UPSTs expire within 60 min anyway. Defer. |

### Anti-Features (Commonly Added, Explicitly NOT for v1)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| UPST refresh loop for long-running jobs | Jobs longer than 60 min will see the UPST expire; AWS action refreshes credentials automatically | OCI CLI has a known unfixed bug (oracle/oci-cli#998) where a running `oci` process does not reload the token file mid-execution. SDK-based callers (Python, Java) using `TokenExchangeSigner` do refresh automatically, but the CLI does not. Building refresh into the action creates a false sense of safety for CLI-heavy jobs. Additionally, composite actions cannot run background processes safely across steps. | Document the 60-min ceiling in the README. For jobs that exceed 60 min, consumers should structure their workflow to re-invoke `oci-token-exchange` between long operations. |
| Output masking by default in run-oci-cli-command | The oracle-actions upstream masks output by default (`silent: true`); seems like a safe default | **Masking output makes debugging impossible.** The upstream's default-masked behaviour has caused significant user confusion (users cannot see what the command returned). Since `core.setSecret` already masks the UPST and client-secret values wherever they appear, additional blanket output masking is redundant and harmful. | Default `silent: false`. Let the UPST masking registered in Action 1 handle any token values that appear in output. Document that callers should use `silent: true` only for commands whose *arguments* contain non-token secrets. |
| Telemetry / usage reporting back to the action author | AWS action tags sessions with repo/workflow metadata; some actions phone home | This is a first-party internal action. Telemetry adds a network call, a third-party dependency, and a privacy surface that is not appropriate for an org-internal tool. No consumers outside ColourWithin will use this. | GitHub's own Actions usage tab provides adequate visibility. |
| Multi-tenancy / multiple OCI credential sets in one job | Advanced CI scenarios may need two OCI regions or two tenancies | The `output-config-path` input already enables writing to alternate paths. Building first-class multi-tenancy (profile management, named configs) would significantly complicate the action for a use case that does not exist in `colour-within-ops`. | Consumers who need two tenancies can invoke `oci-token-exchange` twice with different `output-config-path` values and switch `OCI_CLI_CONFIG_FILE` between steps. Document this pattern. |
| Offline / mock test mode | Faster CI without real OCI credentials | The action's value is the OCI integration. A mock mode would test YAML plumbing, not the token exchange. Stale third-party actions survived precisely because their mock tests passed while the real exchange was broken. | Real smoke tests against a personal-tenancy Service User (as specified in the PRD). No mock mode. |
| `oci session authenticate` / browser-based auth | Some OCI CLI flows require interactive auth | Completely incompatible with non-interactive GitHub Actions runners. | N/A — headless only. |
| Bundled OCI CLI installation in run-oci-cli-command | The oracle-actions upstream installs and caches the CLI inside the action | Installs a large binary on every action invocation; couples CLI version to action release; the upstream's install cache is now stale. Consumers should install the CLI separately and explicitly. | Add a prerequisite note in the README pointing at `oracle-actions/install-oci-cli@<sha>` or `pip install oci-cli` as a workflow step. Action 2 guards with `oci --version` and fails fast if absent. |

---

## Feature Dependencies

```
[OIDC ID token minting]
    └──required-by──> [Token exchange POST to /oauth2/v1/token]
                          └──required-by──> [OCI CLI config file write]
                                                └──required-by──> [run-oci-cli-command step]

[Ephemeral RSA-2048 keypair generation]
    └──required-by──> [Token exchange POST to /oauth2/v1/token]
                          (public key embedded in request body)

[Secret masking — UPST]
    └──must-precede──> [OCI CLI config file write]
                       (UPST written to disk; any debug echo after write must be redacted)

[core.setSecret (client-secret)]
    └──must-precede──> [Any step that echoes inputs]

[expires-at output]
    └──requires──> [Token exchange POST to /oauth2/v1/token]
                   (parse exp claim from returned UPST JWT)

[query input on run-oci-cli-command]
    └──enhances──> [output / raw-output outputs]
                   (JMESPath post-processing of JSON stdout)

[silent input on run-oci-cli-command]
    └──controls──> [command echo before execution]
                   (does NOT affect output masking)
```

### Dependency Notes

- **Token exchange requires keypair generation:** The OCI token-exchange grant shape requires the public key in the POST body. The SDK's `TokenExchangeSigner` handles this internally (Option A). If switching to Option B (bash/curl), the keypair must be generated before the POST.
- **Secret masking must precede any logging:** `core.setSecret` must be called on the UPST and `client-secret` before any step that could log them. In practice this means masking `client-secret` at the very first step, before the token exchange, and masking the UPST immediately after it is received.
- **`oci --version` guard is independent:** Action 2 does not depend on Action 1 — it works with any pre-existing OCI config. The guard catches misconfigured consumer workflows that skip the install step.

---

## MVP Definition

### Launch With (v1)

- [x] OIDC ID token minting with `id-token: write` permission detection and clear error — foundational, no exchange without this
- [x] Ephemeral RSA-2048 keypair generation — required by token-exchange grant shape
- [x] Token exchange POST with 4xx fail-fast + verbatim error surface + 5xx exponential backoff (3 attempts, ~10s) — core exchange behaviour
- [x] UPST and `client-secret` masking via `core.setSecret` — non-negotiable security requirement
- [x] OCI CLI config file write (`security_token_file`, `key_file`, `region`); set `OCI_CLI_AUTH=security_token` — without this, no downstream step works
- [x] `config-path` and `expires-at` outputs on Action 1 — needed by `colour-within-ops` consume pattern
- [x] `oci --version` guard on Action 2 — fail fast rather than silent "command not found"
- [x] `command`, `silent`, `query`, `working-directory` inputs on Action 2 — matches oracle-actions API surface
- [x] `output`, `raw-output`, `exit-code` outputs on Action 2 — needed by `colour-within-ops` calling pattern
- [x] `bash -e -o pipefail` execution on Action 2 — correctness requirement
- [x] Smoke test workflow (`workflows/test-actions.yml`) — gate on PR merge

### Add After Validation (v1.x)

- [ ] `workload` principal type assertion — add if IPT misconfiguration (wrong claim mapping producing `user` principal) is observed in practice; straightforward JWT decode
- [ ] `expires-at` warning for short-lived tokens — add if any `colour-within-ops` job approaches 60-min boundary
- [ ] Automatic retry on 429 rate-limit in run-oci-cli-command — add only if rate-limit errors are observed

### Future Consideration (v2+)

- [ ] Post-job UPST file cleanup — requires switching Action 1 from composite to JavaScript, or accepting a third-party `post-run` dependency; defer until there is a concrete security requirement
- [ ] Multi-tenancy first-class support (named profiles, `OCI_CLI_CONFIG_FILE` management) — defer until a second consuming repo with different tenancy requirements exists

---

## Feature Prioritisation Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| OIDC token minting + `id-token: write` guard | HIGH | LOW | P1 |
| Token exchange POST (4xx/5xx handling) | HIGH | LOW | P1 |
| UPST + client-secret masking | HIGH | LOW | P1 |
| OCI CLI config write + `OCI_CLI_AUTH` env | HIGH | LOW | P1 |
| `expires-at` output | MEDIUM | LOW | P1 |
| `oci --version` guard (Action 2) | HIGH | LOW | P1 |
| `silent` / `query` inputs (Action 2) | MEDIUM | LOW | P1 |
| `output` / `raw-output` / `exit-code` outputs (Action 2) | HIGH | LOW | P1 |
| Smoke test workflow | HIGH | MEDIUM | P1 |
| `workload` principal type assertion | MEDIUM | LOW | P2 |
| `expires-at` proximity warning | LOW | LOW | P2 |
| 429 retry in run-oci-cli-command | LOW | MEDIUM | P2 |
| Post-job credential cleanup | LOW | HIGH | P3 |
| Multi-tenancy first-class support | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for v1.0 launch
- P2: Add after v1 is validated in production
- P3: Future consideration, requires new use case to justify

---

## Peer Action Comparison

| Feature | `aws-actions/configure-aws-credentials` | `google-github-actions/auth` | `azure/login` | `hashicorp/vault-action` | `oracle-actions/run-oci-cli-command` (upstream) | Our approach |
|---------|----------------------------------------|------------------------------|---------------|--------------------------|--------------------------------------------------|--------------|
| OIDC token exchange | Yes — `AssumeRoleWithWebIdentity` | Yes — Workload Identity Federation | Yes — federated identity credential | Yes — JWT with GitHub OIDC | N/A (CLI wrapper only) | Yes — OCI Identity Propagation Trust token exchange |
| Secret masking | Partial — account ID optional; tokens masked | Yes | Not explicitly documented | Yes — all retrieved secrets auto-masked | Yes — output masked by default | Yes — UPST and `client-secret` via `core.setSecret` |
| 4xx error surface | Partial — relies on SDK error messages | Partial | Partial | Not documented | Not documented | Full — `error` + `error_description` verbatim |
| Retry on transient errors | Yes — 12 attempts, configurable | Implicit via SDK | Not documented | Not documented | Not documented | Yes — 3 attempts, ~10s, exponential backoff |
| `id-token: write` guard | Implicit — env var absent → SDK error | Yes — explicit check | Yes — documented requirement | N/A | N/A | Yes — explicit check, clear error message |
| Post-job cleanup | Yes — JavaScript action, native `post` step | Yes — `cleanup_credentials: true` | Yes — pre/post cleanup | N/A | N/A | Not in v1 (composite actions cannot run native `post` steps) |
| Token/credential refresh | No — single exchange per job | No — expires after token lifetime | No | No | No | No — document 60-min UPST ceiling; SDK callers refresh automatically |
| Output defaults | Credentials in env vars | Credentials file + env vars | Session in `az` context | Secrets as env vars | Output masked by default | Credentials file + env vars; output NOT masked by default |
| CLI bundled | No | No (installs `gcloud` separately) | Yes (`az` assumed available) | N/A | Yes — installs and caches OCI CLI | No — guard + fail-fast if absent |
| Telemetry | Session tags → AWS CloudTrail | `request_reason` header for audit | Not documented | Not documented | Not documented | None — internal org tool |
| Principal type assertion | Yes — `allowed-account-ids` validates identity | Implicit in WIF attribute conditions | Not documented | Not documented | Not documented | Not in v1; `workload` assertion deferred to v1.1 |

---

## Sources

- [aws-actions/configure-aws-credentials — GitHub](https://github.com/aws-actions/configure-aws-credentials)
- [google-github-actions/auth — GitHub](https://github.com/google-github-actions/auth)
- [azure/login — GitHub](https://github.com/Azure/login)
- [hashicorp/vault-action — GitHub](https://github.com/hashicorp/vault-action)
- [oracle-actions/run-oci-cli-command — GitHub](https://github.com/oracle-actions/run-oci-cli-command)
- [oracle-actions/run-oci-cli-command action.yml](https://github.com/oracle-actions/run-oci-cli-command/blob/main/action.yml)
- [OCI Python SDK — workload_identity_federation_signer_example.py](https://github.com/oracle/oci-python-sdk/blob/master/examples/workload_identity_federation_signer_example.py)
- [OCI CLI issue #998 — token does not refresh during long multipart uploads](https://github.com/oracle/oci-cli/issues/998)
- [GitHub community — No post run capability for composite actions](https://github.com/orgs/community/discussions/26743)
- [GitHub Docs — About security hardening with OpenID Connect](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [GitHub Actions toolkit — core.ts (setSecret)](https://github.com/actions/toolkit/blob/main/packages/core/src/core.ts)
- [OCI Token Exchange Grant Type](https://docs.oracle.com/en-us/iaas/Content/Identity/api-getstarted/json_web_token_exchange.htm)

---

*Feature research for: ColourWithin/.github OCI composite actions v1.0*
*Researched: 2026-05-09*
