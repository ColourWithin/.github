---
name: Feature PR
about: A pull request that delivers new functionality (gated on an approved-feature issue).
labels: feature
---

<!-- This PR delivers a new feature. The linked issue MUST have the `approved-feature` label before this PR is reviewed. -->

## Linked issue

Closes #<!-- issue number -->

## Feature summary

<!-- One paragraph describing what this PR adds and why. Reference the linked issue's "What is being added" section. -->

## New files

| File | Purpose |
|------|---------|
| <!-- e.g. ColourWithin/Services/SubscriptionDowngradeFlow.swift --> | <!-- Coordinates the StoreKit downgrade UI and entitlement refresh. --> |

## Modified files

| File | Change |
|------|--------|
| <!-- e.g. AppSettingsView.swift --> | <!-- Added "Manage subscription" row, gated on entitlement state. --> |

## Implementation notes

<!-- Anything a reviewer needs to know that isn't obvious from the diff: design choices, trade-offs, or surprising bits. -->

## Spec compliance

<!-- One row per acceptance criterion from the linked issue. -->

- [ ] <!-- Acceptance criterion 1 from the issue, verbatim. --> — verified by <!-- test name or manual step -->
- [ ] <!-- Acceptance criterion 2 --> — verified by <!-- ... -->

## Test coverage

<!-- What tests were added? What existing tests cover this? Are there areas that aren't covered, and why? -->

- New tests:
  - <!-- e.g. SubscriptionDowngradeFlowTests (5 cases) -->
- Coverage gaps (if any) and rationale:
  - <!-- e.g. Live App Store interaction can't be unit-tested; covered by manual UAT step 4. -->

## Verification

- [ ] Builds and runs on the targeted platforms
- [ ] Affected unit tests pass locally
- [ ] Full test suite passes locally
- [ ] CI is green

## Platforms / runtimes tested

- [ ] iPad (physical device)
- [ ] iPad simulator
- [ ] macOS
- [ ] Web
- [ ] N/A — not a UI change

## Breaking changes

<!-- Either: "None — additive" or a description of what breaks and the migration path. -->

## Scope confirmation

- [ ] This PR addresses only the linked issue and does not bundle unrelated changes.
- [ ] Adjacent fixes (if any) are documented in the description and would have been their own PR if larger.
- [ ] Commits are signed (DCO `-s` and cryptographic signing).
- [ ] No `--no-verify` or other hook bypasses were used.
