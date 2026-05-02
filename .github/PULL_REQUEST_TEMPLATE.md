<!--
Default PR template (fallback / switchboard).

GitHub's chooser UI will offer the typed templates from .github/PULL_REQUEST_TEMPLATE/
when this PR is created in a repo that inherits from ColourWithin/.github. If you
landed here instead, you can:

1. Re-create the PR using one of the typed templates by appending a query string:
   - ?template=feature.md
   - ?template=enhancement.md
   - ?template=fix.md

   Example URL when opening a new PR:
   https://github.com/<org>/<repo>/compare/main...<your-branch>?template=feature.md

2. Or fill in the minimal sections below if your change really is too small or
   off-pattern to warrant a typed template (typo fixes, doc-only patches).

The typed templates are strongly preferred — the PR review process expects them.
-->

## What this PR does

<!-- One paragraph. -->

## Linked issue

<!-- e.g. Closes #123 (feature/enhancement) or Fixes #123 (bug fix) -->

## Risk

<!-- One sentence. -->

## How was this verified

<!-- Tests, manual steps, screenshots, etc. -->

## Checklist

- [ ] Linked issue exists and has the appropriate approval label (`approved-feature`, `approved-enhancement`, or `confirmed-bug`)
- [ ] Commits are signed (DCO `-s` and cryptographic signing)
- [ ] CI is passing
- [ ] No `--no-verify` or other hook bypasses
- [ ] Branch will be deleted after merge
