---
name: Enhancement PR
about: A pull request that improves existing functionality (gated on an approved-enhancement issue).
labels: enhancement
---

<!-- This PR improves an existing feature. The linked issue MUST have the `approved-enhancement` label before this PR is reviewed. -->

## Linked issue

Closes #<!-- issue number -->

## What is improved

<!-- One paragraph. Reference the linked issue's "Existing feature being improved" section. -->

## Before / after

| Before | After |
|--------|-------|
| <!-- Concrete example of current behaviour --> | <!-- Concrete example of new behaviour --> |

## Implementation approach

<!-- Brief description of the change, especially anything non-obvious from the diff. -->

## Modified files

| File | Change |
|------|--------|
| <!-- e.g. AppSettingsView.swift --> | <!-- Replaced SFSafariView presentation with system browser via UIApplication.open. --> |

## Verification method

<!-- How did you confirm the improvement actually improves things? -->

- Tests:
  - <!-- e.g. AppSettingsViewTests.privacyLinkOpensInSystemBrowser -->
- Manual:
  - <!-- e.g. Verified on iPad simulator that tapping the Privacy Policy row opens Safari and the system back-to-app affordance is visible. -->

## Verification

- [ ] Affected tests pass locally
- [ ] Full test suite passes locally
- [ ] Manual verification of the before/after behaviour change
- [ ] CI is green

## Platforms / runtimes tested

- [ ] iPad (physical device)
- [ ] iPad simulator
- [ ] macOS
- [ ] Web
- [ ] N/A — not a UI change

## Breaking changes

<!-- Either: "None — UI/behavioural improvement only" or a description of what breaks and the migration path. -->

## Scope confirmation

- [ ] This PR addresses only the linked enhancement and does not bundle unrelated changes.
- [ ] Commits are signed (DCO `-s` and cryptographic signing).
- [ ] No `--no-verify` or other hook bypasses were used.
