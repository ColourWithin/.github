# Contributing

Thanks for considering a contribution to a ColourWithin project. This document is the org-wide default; an individual repo may publish its own `CONTRIBUTING.md` with stricter or repo-specific rules. **The repo-local rules always win** when present.

## Issue-first rule

**Every change starts with an issue.** Before opening a pull request:

1. Search [existing issues](https://github.com/ColourWithin) (org-wide) for an open match.
2. If none exists, file a new one using one of the typed forms:
   - **Bug report** — something is broken or behaving unexpectedly.
   - **Feature request** — propose new functionality.
   - **Enhancement** — improve existing functionality (faster, clearer, more accessible).
   - **Chore** — internal/maintenance work with no user-facing behaviour change.
3. Wait for triage. Maintainers may apply `needs-review`, `approved-feature`, `approved-enhancement`, `confirmed-bug`, or `wontfix` labels. **Do not open a PR for a feature or enhancement without an approval label** — it will be closed pending issue triage.

The only exception: trivial fixes (typos, obvious one-line bug fixes, doc-only corrections) may be opened as a fix PR with `Fixes #NNN` linking the bug report, even before approval.

## Pull request rules

- **Use a typed PR template.** The chooser at PR-create time offers Feature / Enhancement / Fix. Don't paste over the template with a freeform description — fill the checklist.
- **Link the issue.** `Closes #NNN` for features/enhancements, `Fixes #NNN` for bug fixes. PRs without a linked issue are returned for triage.
- **One issue per PR.** Splits and reverts are easier when the link is 1:1.
- **Sign your commits.** Both DCO sign-off (`-s`) and GPG (or SSH) cryptographic signing are required for protected branches. Configure once, then it's automatic.
- **Conventional Commits.** Commit messages follow the [Conventional Commits](https://www.conventionalcommits.org/) spec — `feat`, `fix`, `docs`, `test`, `chore`, `refactor` are the most common. Scopes are optional but encouraged when the change is localised (`feat(auth):`, `fix(ipad):`).
- **Don't `--amend` published commits.** If a commit hook fails after pushing, fix the issue and add a new commit. `--amend` rewrites history that other contributors may already have pulled.

## Branch naming

`<type>/<scope>` — examples:
- `feat/onboarding-permission`
- `fix/storekit-bundle-loader`
- `chore/dependency-bumps`
- `gsd/phase-14-kids-category` (used by the GSD planning workflow)

## Review and merge

- Solo-author repos may self-merge after CI passes.
- Multi-author repos require at least one approving review.
- Squash-merge by default; preserve the per-commit history only when a linear log is materially better than the squashed summary.
- Delete the branch after merge.

## What goes where

- **Discussion / brainstorming** — open an issue first, then optionally promote to a Discussion if the conversation outgrows the issue.
- **Security disclosure** — see [`SECURITY.md`](SECURITY.md). Do not file public issues for security vulnerabilities.
- **Code of conduct** — see [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Reports go to the org admin.

## Local development

Repo-specific setup lives in each repo's own `README.md`. The org-wide convention:

- `main` is the integration branch.
- Feature branches diverge from `main`, get rebased onto `main` before merge if the diff is small enough that rebasing is cleaner than merging.
- CI must pass before merge — never bypass with `--no-verify`.
