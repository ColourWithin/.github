# Phase 3: Pattern Map

**Phase:** 03 - Smoke Test, Branch Protection, and v1.0.0 Tag
**Status:** Complete

## Files to Create or Modify

| Target | Role | Closest Analog | Pattern to Reuse |
|--------|------|----------------|------------------|
| `.github/workflows/test-actions.yml` | Local release-readiness workflow | existing same file | Preserve existing Python/npm/static gates; add cache/checksum/release-readiness checks incrementally |
| `.planning/REQUIREMENTS.md` | Requirement truth | existing same file | Update stale SMOKE requirements to reflect external smoke boundary without changing v1 release goal |
| `.planning/ROADMAP.md` | Phase plan list and success criteria | existing same file | Annotate plans and external dependency accurately |
| `docs/actions/oci-ipt-smoke.md` | External smoke handoff | `docs/actions/oci-token-exchange.md`, `docs/actions/run-oci-cli-command.md` | Consumer-focused docs with exact YAML snippets and caveats |
| `docs/actions/README.md` | Action docs index | existing same file | Add one concise bullet/link for smoke handoff |
| `README.md` | Minimal internal release note | existing README | Keep org-health navigation, add a short actions section rather than a tutorial |
| `.planning/phases/03-.../03-EXTERNAL-SMOKE-EVIDENCE.md` | Release evidence record | `03-CONTEXT.md` structure | Explicit fields, candidate SHA, run URL, command, result |

## Data Flow

1. `.github` local PR workflow validates source, docs, pins, checksums, package builds, tests, and generated artifacts.
2. Candidate commit SHA from `.github` is handed to `colour-within-ops`.
3. `colour-within-ops/.github/workflows/oci-ipt-smoke.yml` runs manually in `production`, requests OIDC audience `https://github.com/ColourWithin/colour-within-ops`, and calls both actions by candidate SHA.
4. External smoke runs `oci os ns get` through the wrapper action and records the run URL/result.
5. `.github` release gate verifies local required checks, branch protection, external smoke evidence, README/docs, and final human approval before `v1.0.0`.

## Code Excerpts to Preserve

Existing workflow action pin pattern:

```yaml
uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd  # v6.0.2
```

Existing no-input-interpolation scanner:

```python
needle = "$" + "{{ inputs."
```

Existing TypeScript action freshness check:

```bash
git diff --exit-code -- actions/run-oci-cli-command/dist/index.js
```

## Planning Guidance

- Do not create a local real-OCI smoke job in `.github`.
- Do not require external `colour-within-ops` smoke as a native branch protection status in `.github`.
- Keep the manual evidence gate explicit and hard to skip.
- Treat documentation as part of the release gate, not as a nice-to-have.

## PATTERN MAPPING COMPLETE
