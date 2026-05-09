# Pitfalls Research

**Domain:** GitHub composite actions — OCI OIDC token-exchange and CLI wrapper
**Researched:** 2026-05-09
**Confidence:** HIGH (critical/security pitfalls verified against official docs and tracker issues); MEDIUM (OCI-specific error UX, TTL edge cases)

---

## Critical Pitfalls

### Pitfall 1: UPST Leaks Because `core.setSecret` Silently Fails on Multiline Strings

**What goes wrong:**
A UPST is a JWT and contains dots, so it is a single line. But if the Python exchange script ever emits the UPST with any surrounding whitespace, a trailing newline, or wraps it inside a JSON payload that itself is multiline, calling `core.setSecret(value)` on the whole string registers no effective mask — and the runner never warns. The token appears unredacted in logs.

**Why it happens:**
`core.setSecret` (and the underlying `add-mask` workflow command) only masks the exact single-line string that is registered. Any string containing `\n` or `\r\n` is silently accepted but produces a no-op mask. The GitHub Actions toolkit issue [#1421](https://github.com/actions/toolkit/issues/1421) confirmed this "fails open" design: no error is raised, masking just does not work.

**How to avoid:**
- Strip the UPST to a bare single line (`.strip()` in Python, `tr -d '\n'` in bash) before registering it with `setSecret`.
- Register `client-secret` with `setSecret` as the very first step, before any other output is produced — masking only applies to log lines written after the call.
- Never log the raw HTTP response body from the token endpoint; extract the token field first, then strip, then mask.
- Do not base64-encode the UPST or `client-secret` and emit the encoded form to logs — the encoded form is a different string and will not be masked.

**Warning signs:**
- Smoke-test log shows the full three-segment JWT string (`eyJ…`) anywhere in output.
- `client-secret` value appears in verbose curl output.
- Any step that runs before `setSecret` is called has access to the raw secret.

**Phase to address:** Action 1 implementation phase. Verified by inspecting smoke-test logs for any unmasked token substring.

---

### Pitfall 2: Wrong `requested_token_type` Value Returns 400 With an Unhelpful Error

**What goes wrong:**
The OCI token endpoint for JWT-to-UPST exchange requires `requested_token_type=urn:oci:token-type:oci-upst` (with the `oci-` infix). The `gtrevorrow` action and several community examples use the shortened form `urn:oci:token-type:upst` (without the infix). The endpoint returns a 400 whose `error_description` does not clearly indicate the offending parameter.

**Why it happens:**
The OCI release note that introduced the JWT-to-UPST grant type ([release note](https://docs.oracle.com/en-us/iaas/releasenotes/identity/identity-jwt-to-upst-token-exchange.htm)) and the canonical docs page ([JWT exchange docs](https://docs.oracle.com/en-us/iaas/Content/Identity/api-getstarted/json_web_token_exchange.htm)) both use `urn:oci:token-type:oci-upst`, but older blog posts and the upstream action under replacement use the short form. The error is generic enough to mislead — it appears to be a client-auth or audience failure.

**How to avoid:**
Hard-code `urn:oci:token-type:oci-upst` in the Python script. Add a comment citing the source. Do not derive the string from an input — it is not a caller-configurable parameter.

**Warning signs:**
- 400 from the token endpoint on a request that looks syntactically correct.
- `error_description` mentions "invalid request" without pointing at a specific field.
- Works in a curl test with the full form but not in the Python script.

**Phase to address:** Action 1 implementation phase. Add an assertion test that the literal string is present in the Python source.

---

### Pitfall 3: `allowImpersonation = false` Produces `principal.type = 'user'` — the Wrong Principal Class

**What goes wrong:**
This is the exact defect in `gtrevorrow/oci-token-exchange-action` that motivated building a first-party replacement. When the Identity Propagation Trust is configured with `allowImpersonation: false`, OCI exchanges the GitHub JWT for a UPST that bears `principal.type = 'user'`. OCI policies written for `ANY {request.principal.type='workload'}` silently deny the request. The token appears valid and produces a real UPST, making the bug invisible until a downstream OCI API call fails with a permissions error.

**Why it happens:**
`allowImpersonation: false` is the default when creating an IPT and is correct only when the external identity actually owns an OCI identity domain user account (i.e., a real human federated from an external IdP). For CI/CD automation against a Service User, `allowImpersonation: true` is required, combined with `impersonationServiceUsers` rules that match GitHub claims (e.g. `sub eq *`) to the Service User's OCID. The resulting UPST then carries `principal.type = 'workload'`.

**How to avoid:**
- This action does not control the IPT configuration — that is `colour-within-ops` Tofu IaC. However, the action must document this dependency clearly in its README and emit an informative error when a downstream OCI call fails due to principal type.
- The smoke test must call an OCI API that would fail for a `user` principal under the policy written for the Service User's group, so a mis-configured IPT is caught immediately rather than silently succeeding.
- In the smoke test, assert on `oci iam user get --user-id <service-user-ocid>` or a similarly permission-scoped call, not just `oci iam region list` (which succeeds for any authenticated principal regardless of principal type).

**Warning signs:**
- `oci iam region list` exits 0 but a resource-level call returns 404 or 401.
- OCI audit log shows `principalType: user` instead of `workload`.
- Tofu `oci_identity_domains_identity_propagation_trust` resource has `allow_impersonation = false` (or the field is absent — it defaults to false).

**Phase to address:** Both the IPT Tofu module in `colour-within-ops` (Phase 02) and the smoke-test assertions in `workflows/test-actions.yml` here. The smoke test is this repo's gate.

---

### Pitfall 4: Audience Mismatch Produces a Cryptic 400 That Does Not Name the Mismatching Field

**What goes wrong:**
The `audience` input to Action 1 (default: `https://github.com/ColourWithin`) must match the audience value configured on the OCI IPT exactly — case-sensitively, including trailing slash presence/absence. If they differ, the token endpoint returns `{"error":"invalid_request","error_description":"..."}` but the description typically mentions claim validation failure generically, not which claim failed or what value was expected.

The GitHub OIDC token's `aud` claim is set at mint time by passing the audience to `ACTIONS_ID_TOKEN_REQUEST_URL&audience=<value>`. If the action mints the token with one audience value but the IPT was configured with a different value, the validation fails.

**Why it happens:**
Two separate places must agree on the audience string: (1) the `audience` field when minting the GitHub OIDC token, and (2) the `allowedTokenAudiences` list on the IPT in OCI Identity Domains. They are configured by different teams at different times (this action vs. Tofu IaC in `colour-within-ops`). The default `https://github.com/ColourWithin` is the ColourWithin org convention but must be documented and enforced consistently.

**How to avoid:**
- Document the required audience value in both this action's README and the Tofu module's variable description.
- In the smoke test, if `oci-token-exchange` returns a 400, surface the full `error` and `error_description` JSON verbatim. Do not swallow or reformat it — the raw string is the only diagnostic signal.
- Consider emitting a "hint" message when a 400 is received: "If this is an audience mismatch, verify the `audience` input matches `allowedTokenAudiences` on the IPT in OCI."

**Warning signs:**
- 400 from `/oauth2/v1/token` immediately after minting a valid GitHub OIDC token.
- Token exchange worked in manual curl test using a different audience string.
- OCI audit log shows the request arriving and failing at the claim-validation stage.

**Phase to address:** Action 1 implementation (error surface) and smoke-test setup. The IPT Tofu module must output the configured audience so it can be cross-checked.

---

### Pitfall 5: `set -x` in Any Step Leaks Credentials to the Debug Log

**What goes wrong:**
If `ACTIONS_STEP_DEBUG=true` is set (either as a repository variable for debugging or accidentally left in a fork's configuration), bash's xtrace mode (`set -x`) is not automatically enabled — but if any step in the action or the consumer workflow explicitly uses `set -x`, every command including those that expand `$OCI_CLI_CLIENT_SECRET` or the ephemeral private key path will be printed verbatim to the debug log. GitHub's secret masking only applies to values registered via `setSecret` and only to log lines, not to xtrace output that is produced before masking is registered.

**Why it happens:**
Developers add `set -x` to composite action steps for debugging, forget to remove it, and it ends up in the shipped action. Composite actions also inherit the runner's environment, so any shell debug flags set by a parent step persist into sub-steps unless explicitly cleared.

**How to avoid:**
- Never use `set -x` in any shell step that handles `client-secret`, the GitHub OIDC token, or the ephemeral private key. If tracing is needed for debugging, gate it: `[[ "${ACTIONS_STEP_DEBUG:-}" == "true" ]] && set -x` — but only in steps that do not touch secrets.
- Explicitly use `set +x` at the start of any step that runs security-sensitive commands, as a belt-and-suspenders guard.
- The `shell: bash` default in composite actions runs with `--noprofile --norc -e -o pipefail` but does NOT enable xtrace. Verify this stays the case — do not change the shell invocation.

**Warning signs:**
- Any log line beginning with `+` (xtrace prefix) in a step that also echoes secret-adjacent values.
- Debug runs show `curl -u client_id:client_secret ...` in full.

**Phase to address:** Action 1 implementation review. Add a CI lint rule or grep check that asserts `set -x` is not present in security-sensitive steps.

---

### Pitfall 6: Script Injection via `${{ inputs.command }}` in Action 2

**What goes wrong:**
Action 2 accepts a `command` input that is the raw `oci ...` command string. If that input is expanded inline in a shell `run:` step using `${{ inputs.command }}` (template interpolation), a consumer workflow that passes a command string containing shell metacharacters (`; rm -rf ...`, backticks, `$(...)`) will execute arbitrary commands on the runner.

**Why it happens:**
GitHub Actions template expressions are evaluated before the shell sees the string, so `${{ inputs.command }}` is text-substituted directly into the shell script. If the input contains `"; secret_exfil_command"`, the shell sees two separate commands.

**How to avoid:**
- Pass the command to the shell via an environment variable, not via inline template expansion:
  ```yaml
  env:
    ACTION_COMMAND: ${{ inputs.command }}
  run: |
    eval "$ACTION_COMMAND"
  ```
  Even this is not fully safe for untrusted input, but for this action the consumers are trusted (internal org workflows), and the env-var approach prevents the injected value from being interpreted at the YAML level.
- Prefer the explicit env approach over inline `${{ }}` for all inputs that contain shell commands.
- Do not call `eval` on externally untrusted input. For ColourWithin's internal use this is acceptable; document it as an internal-use-only action.

**Warning signs:**
- `action.yml` contains `run: ${{ inputs.command }}` without an `env:` wrapper.
- Composite action steps that echo or reference `${{ inputs.x }}` directly in the shell body rather than through `$INPUT_X` or an explicit env variable.

**Phase to address:** Action 2 implementation phase. Verify in code review that no `${{ inputs.* }}` appears directly in `run:` bodies.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Pin `oci>=2.168,<3` and always `pip install` fresh | Tracks upstream patches without action changes | ~5–8s cold-start per job; `pip install` may pull transitive deps that change silently | Acceptable given deploy workflows are not latency-sensitive; revisit if cold-start becomes painful |
| No `post:` cleanup step (composite limitation) | Simpler action structure | Ephemeral private key written to `~/.oci/upst.pem` is not explicitly deleted on failure | Acceptable because GitHub-hosted runners are ephemeral VMs; unacceptable on persistent self-hosted runners |
| `oci --version` probe in Action 2 instead of structured dependency check | Simple implementation | Gives a misleading error message if OCI CLI is installed but misconfigured | Acceptable for v1.0; improve error message if consumer confusion reported |
| Smoke tests require real OCI tenancy | Tests the actual integration | Cannot run in forked PRs without secrets; blocks external contributors | Never acceptable to mock — but fork PRs are not the target consumer scenario |
| SHA-pin consumption rather than tag pin | Supply-chain hygiene | Consumer PRs need a manual SHA update on action upgrades | By design; do not change |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OCI token endpoint | Using `subject_token_type=urn:ietf:params:oauth:token-type:jwt` (the RFC value) vs `jwt` (the OCI-specific short form) | Use exactly `subject_token_type=jwt` as shown in OCI docs; the RFC long-form may not be accepted |
| OCI token endpoint | Not URL-encoding the `public_key` parameter when it contains `+` or `=` characters | Use `--data-urlencode` (curl) or Python's `urllib.parse.urlencode` — never manual string concatenation |
| OCI CLI config | Forgetting `OCI_CLI_AUTH=security_token` env var — CLI defaults to API key auth and ignores `security_token_file` | Set `OCI_CLI_AUTH=security_token` in `$GITHUB_ENV` from Action 1 so every subsequent step inherits it |
| GitHub OIDC token | Minting the OIDC token without `id-token: write` permission — the env vars are present but the request returns 403 | Fail fast with an explicit "add `permissions: { id-token: write }` to your workflow" message; check for the env vars first |
| Python SDK `TokenExchangeSigner` | Hardcoding `audience: "github-actions"` from the Oracle example instead of using the configurable input | The Oracle example uses `"github-actions"` as a placeholder; the real audience must match the IPT's `allowedTokenAudiences` — default to `https://github.com/ColourWithin` |
| OCI CLI in Action 2 | Capturing both stdout and stderr in `outputs.output` | Capture stdout only to `outputs.output`; let stderr flow to the runner log normally so it appears in the job summary without being swallowed |
| Multiline `command` input in Action 2 | YAML block scalar (`|`) input collapsing into a single line when read by the runner | Trim leading/trailing whitespace before execution; test with both inline and block-scalar consumer syntax |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `pip install oci` on every run, no cache | 5–8s per job, cumulative minutes per day on busy repos | Use `actions/setup-python` with `cache: pip` and a `requirements.txt` pinning `oci>=2.168,<3` | At more than ~20 deploys/day it becomes noticeable friction |
| UPST 60-minute TTL with no re-exchange for long jobs | `401 NotAuthenticated` mid-job for operations lasting >60 minutes (e.g. large OCI Object Storage uploads) | Document the 60-minute ceiling; for long-running operations, re-invoke Action 1 mid-job or use `TokenExchangeSigner` which refreshes automatically | Immediately for any single OCI CLI call or SDK operation that takes >60 min; [OCI CLI issue #998](https://github.com/oracle/oci-cli/issues/998) confirms the CLI does not auto-refresh |
| `pip install --user` putting binaries outside PATH | Python scripts installed to `~/.local/bin` which is not on PATH for subsequent steps | Use `pip install --user` and ensure `~/.local/bin` is added to `$GITHUB_PATH`, or install into a venv and add the venv's bin to PATH | Any step that tries to invoke an installed script by name |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Writing ephemeral private key to a world-readable path | Any other process on the runner (shared or self-hosted) can read the key and forge OCI requests for the duration of the UPST | Write the key to `~/.oci/` and `chmod 600` immediately; OCI SDK enforces this and will error if permissions are too open |
| Not registering `client-secret` with `setSecret` before any output is produced | `client-secret` appears in log lines emitted by the Python script during the HTTP request phase | Register `client-secret` as the very first operation in the action, before any subprocess is launched |
| Echoing the `command` input in Action 2 without the `silent` guard | Commands containing secret-derived values (e.g. a secret fetched via `oci vault secret get-secret-bundle`) are printed to the log | Default `silent: false`; when the consumer passes a command that reads secrets, they must pass `silent: true`; document this clearly |
| Leaving `~/.oci/config` and `~/.oci/upst.pem` on a persistent self-hosted runner | Subsequent jobs on the same runner can authenticate as the Service User without re-exchanging | GitHub-hosted runners are ephemeral VMs — this is not a concern there. If self-hosted runners are ever used, add an explicit cleanup step using `if: always()` at the workflow level (not the action level — composite actions have no post-run hook) |
| Trusting `opc-request-id` as a security boundary | The request ID is useful for Oracle support but is not a secret; it can be logged | Log it freely; do not confuse it with the UPST or private key |

---

## "Looks Done But Isn't" Checklist

- [ ] **UPST masking:** `core.setSecret` is called after `.strip()` — verify by searching smoke-test logs for any `eyJ` substring.
- [ ] **`client-secret` masking:** registered before any subprocess is launched; test by checking that `***` appears in log where the secret would otherwise appear.
- [ ] **`OCI_CLI_AUTH`:** set to `security_token` in `$GITHUB_ENV` — verify `oci iam region list` succeeds without `--auth security_token` flag.
- [ ] **Principal type:** smoke-test asserts on a permission-scoped call, not just `oci iam region list` — confirm the OCI audit log shows `principalType: workload`.
- [ ] **`requested_token_type` value:** literally `urn:oci:token-type:oci-upst` with the `oci-` infix — grep the Python source.
- [ ] **Private key permissions:** `chmod 600 <key-path>` before the OCI SDK reads the key — OCI SDK will error on group/world-readable keys, but the error message is confusing.
- [ ] **No `set -x` in security steps:** grep action YAML for `set -x` or `set -o xtrace` in steps that touch credentials.
- [ ] **No inline `${{ inputs.command }}`** in Action 2 shell body — must go through env var.
- [ ] **Smoke test gates the merge:** `test-actions.yml` is listed as a required status check in branch protection.
- [ ] **`error_description` surfaced:** when the token endpoint returns 4xx, the raw JSON is printed to the runner log before the step fails.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| UPST leaked to logs | HIGH | Rotate: delete and recreate the OCI Confidential Application's client secret; update `OCI_OIDC_CLIENT_SECRET` in GitHub Secrets; audit OCI audit log for API calls made with the leaked token during the exposure window |
| Wrong `requested_token_type` causing 400 | LOW | Fix the literal string in the Python script; redeploy |
| Audience mismatch | LOW | Either change the `audience` action input or update the IPT's `allowedTokenAudiences` in Tofu; re-apply Tofu |
| `allowImpersonation: false` (wrong principal type) | MEDIUM | Update the `oci_identity_domains_identity_propagation_trust` Tofu resource to set `allow_impersonation = true` and configure `impersonation_service_users`; re-apply; re-run smoke test |
| Ephemeral key leaked to world-readable path | MEDIUM | `chmod 600` fix is immediate; rotate client secret as precaution since the key alone is useless without a valid UPST |
| `pip install` breaking due to transitive dependency conflict | MEDIUM | Pin the conflicting transitive dep explicitly in `requirements.txt`; test locally with `pip install --dry-run` |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| UPST multiline masking failure | Action 1 implementation | Grep smoke-test log for `eyJ`; assert absent |
| Wrong `requested_token_type` | Action 1 implementation | Grep Python source for literal `urn:oci:token-type:oci-upst` |
| `allowImpersonation: false` (user vs workload) | `colour-within-ops` Phase 02 (Tofu IPT) + smoke test in this repo | OCI audit log shows `principalType: workload`; permission-scoped smoke-test call succeeds |
| Audience mismatch | Action 1 implementation + Tofu IaC docs | Smoke test passes end-to-end; 400 path surfaces `error_description` |
| `set -x` credential leak | Action 1 implementation review | Lint/grep check in CI for `set -x` in credential-adjacent steps |
| Script injection via `${{ inputs.command }}` | Action 2 implementation | Code review: no `${{ inputs.* }}` in shell `run:` bodies |
| `OCI_CLI_AUTH` not set | Action 1 implementation | Smoke test: `oci iam region list` without explicit `--auth` flag succeeds |
| Private key file permissions | Action 1 implementation | OCI SDK raises on wrong permissions; add explicit `chmod 600` assertion |
| UPST 60-minute TTL for long jobs | Documentation + consumer guidance | Document ceiling in README; no auto-fix needed for v1.0 |
| No composite post-run hook for cleanup | Architecture decision | Accept for GitHub-hosted runners; document self-hosted runner warning |

---

## Sources

- [GitHub Actions toolkit issue #1421 — `setSecret` silently fails on multiline](https://github.com/actions/toolkit/issues/1421) — confirms masking failure mode
- [OCI JWT-to-UPST token exchange docs](https://docs.oracle.com/en-us/iaas/Content/Identity/api-getstarted/json_web_token_exchange.htm) — canonical request parameters including correct `requested_token_type`
- [OCI JWT-to-UPST release note](https://docs.oracle.com/en-us/iaas/releasenotes/identity/identity-jwt-to-upst-token-exchange.htm) — introduction of `urn:oci:token-type:oci-upst`
- [OCI workload identity federation blog (ateam)](https://www.ateam-oracle.com/workload-identity-federation) — `allowImpersonation` and `principal.type` explanation
- [OCI Python SDK workload_identity_federation_signer_example.py](https://github.com/oracle/oci-python-sdk/blob/master/examples/workload_identity_federation_signer_example.py) — first-party GitHub Actions example (note placeholder audience `"github-actions"`)
- [GitHub script injection docs](https://docs.github.com/en/actions/concepts/security/script-injections) — `${{ inputs.x }}` vs env var injection risk
- [GitHub composite actions — no `post:` step support](https://github.com/orgs/community/discussions/26743) — confirmed fundamental limitation
- [GitHub composite actions — `if: failure()` not supported](https://github.com/actions/runner/issues/1271) — runner issue tracker
- [OCI CLI issue #998 — session token not refreshed during long operations](https://github.com/oracle/oci-cli/issues/998) — 60-minute TTL ceiling
- [OCI CLI environment variables — `OCI_CLI_AUTH`](https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/clienvironmentvariables.htm) — auth method precedence
- [GitHub Actions multiline `GITHUB_OUTPUT` handling](https://github.com/github/docs/issues/21529) — heredoc EOF pattern for outputs
- [GitHub runner issue #1955 — pipefail inconsistency](https://github.com/actions/runner/issues/1955) — explicit shell specification recommendation

---
*Pitfalls research for: ColourWithin/.github composite actions — OCI OIDC token-exchange and CLI wrapper*
*Researched: 2026-05-09*
