# ColourWithin .github

Org-wide [community health files](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file) for the [ColourWithin](https://github.com/ColourWithin) organisation.

Once this repo is published as `github.com/ColourWithin/.github`, every other repo in the org automatically inherits the files here as fallbacks — issue forms, PR templates, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`. Any child repo that ships its own version of a file overrides the org-level fallback by file presence.

## First-party GitHub Actions

This repo also publishes internal ColourWithin GitHub Actions:

- `ColourWithin/.github/actions/oci-token-exchange@<sha>` - exchange GitHub Actions OIDC for an OCI UPST through IPT.
- `ColourWithin/.github/actions/run-oci-cli-command@<sha>` - run OCI CLI commands through argv-safe execution and captured outputs.

Consumers pin a commit SHA. The doubled `.github` path is expected because this is the organisation default repository. Detailed usage, prerequisites, and smoke-test guidance live in [docs/actions/](docs/actions/).

Release candidate: `v1.0.0` is tagged only after local checks pass and the `colour-within-ops` IPT smoke evidence records the exact candidate SHA.

## Layout

```
.github                                ← repo root
├── README.md                          (this file — not inherited)
├── .gitignore                         (Jekyll-aware, in case the repo ever serves Pages content)
├── CONTRIBUTING.md                    ↳ inherits to all repos in the org
├── CODE_OF_CONDUCT.md                 ↳ inherits to all repos in the org
├── SECURITY.md                        ↳ inherits to all repos in the org
└── .github/
    ├── ISSUE_TEMPLATE/
    │   ├── config.yml                 (chooser config — disables blank issues)
    │   ├── bug_report.yml
    │   ├── feature_request.yml
    │   ├── enhancement.yml
    │   └── chore.yml
    ├── PULL_REQUEST_TEMPLATE.md       (default fallback / switchboard)
    └── PULL_REQUEST_TEMPLATE/
        ├── feature.md
        ├── enhancement.md
        └── fix.md
```

## Override mechanics

A child repo's local file always wins. To customise contribution rules for a single repo (e.g. iOS-specific bug-report fields), commit the customised file to that repo's `.github/` directory and the org-level version is ignored — no opt-out, no opt-in, just file-presence-based override.

This is good for a multi-repo org where the consumer-app repo and the supporting repos share contribution norms but differ in technical detail.

## Multi-PR-template inheritance note

GitHub's multi-PR-template inheritance via the org `.github` repo has historically been less reliable than issue-template inheritance. The chooser UI may not surface typed templates (`feature.md` / `enhancement.md` / `fix.md`) from the org-level fallback in every child repo. The mitigations:

1. **`.github/PULL_REQUEST_TEMPLATE.md`** — a single default that always inherits cleanly. Acts as a switchboard with links to the typed templates via `?template=feature.md` / `?template=enhancement.md` / `?template=fix.md` URLs.
2. **Per-child-repo opt-in** — a child repo that wants reliable typed-template inheritance can add a tiny `.github/PULL_REQUEST_TEMPLATE/` directory of its own. This costs each repo three small files but guarantees the chooser UI works.

If a child repo's chooser UI does surface the typed templates straight from this org repo, no extra work is needed.

## Verifying inheritance

GitHub doesn't expose an API endpoint for "which community health files is repo X currently using and where do they come from?" — but you can sanity-check by visiting:

- `github.com/ColourWithin/<repo>/community` — the Community Standards page lists which files are detected and links to whichever repo provides them.
- `github.com/ColourWithin/<repo>/issues/new/choose` — the issue chooser shows the inherited issue forms (chose between Bug, Feature, Enhancement, Chore, or jump to Discussions / SECURITY.md).
- `github.com/ColourWithin/<repo>/compare/main...some-branch?template=feature.md` — direct test that a typed PR template is reachable.

## Reports

Per `CODE_OF_CONDUCT.md`, conduct reports route to **team@colourwithin.app**. Security reports use GitHub's private vulnerability reporting flow per `SECURITY.md`.

## Org public profile

If a customised landing page is wanted on `github.com/ColourWithin`, that lives at `profile/README.md` (a separate file from this README, intentionally not scaffolded yet). The repo's own `README.md` (this file) is just internal navigation for maintainers.
