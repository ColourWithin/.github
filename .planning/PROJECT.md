# ColourWithin/.github — Composite Actions

## What This Is

First-party GitHub composite actions hosted in the `ColourWithin/.github` org repository, providing OCI (Oracle Cloud Infrastructure) authentication and CLI execution primitives for ColourWithin org workflows. Consumed by `colour-within-ops` (and later `colour-within-svc`) via SHA-pinned `uses: ColourWithin/.github/actions/<name>@<sha>` references.

## Core Value

ColourWithin workflows authenticate to OCI as a properly-classified Service User via short-lived UPSTs — replacing unmaintained third-party actions that ship CVEs and use the wrong principal type — without depending on stale upstreams.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- v1.0 scope. -->

- [ ] `actions/oci-token-exchange` — exchange GitHub Actions OIDC ID token for OCI UPST via Identity Propagation Trust; write OCI CLI/SDK config; mask UPST in logs
- [ ] `actions/run-oci-cli-command` — TypeScript JavaScript action for argv-safe OCI CLI invocations; installs/upgrades oci-cli>=3.81.1; captures stdout/raw stdout/exit-code/oci-cli-version
- [ ] `workflows/test-actions.yml` — PR smoke test against personal-tenancy IPT (gated on consumer populating secrets)
- [ ] Tag `v1.0.0` and document SHA-pin consumption pattern

### Out of Scope

<!-- Explicit boundaries. -->

- OCIR login action — consumer uses `docker/login-action@v3` directly with Vault-fetched OCIR auth token
- OCIR repo lookup/management — already managed by `colour-within-ops` Tofu IaC
- OKE kubeconfig action — no OKE in any current ColourWithin project
- Offline / mocked test mode for the actions — value is in OCI integration; testing without OCI is testing the wrong thing
- IPT, Service User, Group, Confidential Application, policies in OCI — built via Tofu in `colour-within-ops/deploy/tofu/modules/identity/`
- Populating consumer-repo secrets — handled by Tofu output → `gh secret set` runbook in `colour-within-ops`

## Context

- This is the GitHub org-default `.github` repo for `ColourWithin`. It already hosts community health files (CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, README, ISSUE_TEMPLATE, PULL_REQUEST_TEMPLATE, profile/) and now expands to host reusable Actions.
- Triggered by `colour-within-ops` Phase 04 (CI/CD pipeline) discovering two architectural defects in cycle-2:
  1. `gtrevorrow/oci-token-exchange-action` is unmaintained (last substantive release 2025-06-12), ships unpatched `axios < 1.12.0` (CVE-2025-58754), and produces a UPST with `principal.type = 'user'` (impersonated user) instead of `'workload'`.
  2. `oracle-actions/*` family has not seen substantive commits since Nov–Dec 2024; original author (now on ColourWithin team) no longer has Oracle org access.
- Source PRD: `PRD-composite-actions.md` (2026-05-09) at repo root.
- Sequencing: independent of `colour-within-ops` Phase 02 (IPT IaC). Both proceed in parallel; Phase 04 cycle-3 in `colour-within-ops` consumes both outputs.

## Constraints

- **Tech stack**: Action 1 = composite + Python (Oracle's first-party `oci.auth.signers.TokenExchangeSigner` from `oci>=2.168,<3`). Action 2 = TypeScript JavaScript action bundled with ncc and run on Node 24.
- **Security**: UPST and `client-secret` registered with `core.setSecret`. No retry on 4xx token-endpoint responses. Surface OCI `error` / `error_description` verbatim. Retry on 5xx/transient: exponential backoff, max 3 attempts, ~10s total.
- **Supply chain**: Consumers pin by commit SHA, not tag. Tags exist for human readability only. Repo path is doubled (`ColourWithin/.github/actions/...`) per GitHub's org-default-repo rule.
- **Permissions**: Consuming workflows must declare `permissions: { id-token: write, contents: read }`. Action 1 fails fast with a clear message if missing.
- **Testing**: Smoke tests run against personal-tenancy Service User and IPT, gated on `colour-within-ops` populating `OCI_OIDC_CLIENT_IDENTIFIER` / `OCI_OIDC_CLIENT_SECRET` / `OCI_DOMAIN_BASE_URL` in this repo's secrets/variables.
- **Audience default**: `https://github.com/ColourWithin` — must match `audience` configured on the IPT.
- **Region default**: `ap-sydney-1`.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build first-party actions instead of forking `gtrevorrow/oci-token-exchange-action` or `oracle-actions/*` | Both upstreams stale; replicate only the subset we need; eliminate CVE exposure and wrong-principal-type bug | — Pending |
| Action 1 = Option A (composite + Python with `oci` SDK) over Option B (bash + curl + openssl) | Faithfulness to Oracle's first-party reference example outweighs ~5–8s `pip install` cost; deploy workflows are not latency-sensitive | — Pending |
| `oci` SDK pinned as `>=2.168,<3` (minimum, not exact) | Track upstream patch fixes without action-side churn | — Pending |
| Action 2 = TypeScript JavaScript action bundled with ncc | Safer argv parsing, output capture, and install/failure handling outweigh committed dist overhead | — Pending |
| Consumers pin by SHA, not tag | Supply-chain hygiene preference across ColourWithin org | — Pending |
| Smoke tests require real OCI; no offline/mock mode | Value of action is in OCI integration; mocked tests would test the wrong thing | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-09 after /gsd-new-project initialization (v1.0 OCI Composite Actions)*
