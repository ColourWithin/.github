---
name: Fix PR
about: A pull request that fixes a confirmed bug.
labels: fix
---

<!-- This PR fixes a bug. Ideally, the linked issue has the `confirmed-bug` label before this PR is opened, but trivial fixes (typos, obvious one-liners) are exempt from that gate. -->

## Linked issue

Fixes #<!-- issue number -->

## What was broken

<!-- One paragraph describing the bug, ideally referencing the linked issue's "What happened" section. -->

## Root cause

<!-- The actual underlying reason. Not "the symptom". A reviewer should understand WHY this fix works after reading this. -->

## What this PR changes

<!-- One paragraph describing the fix. -->

## Modified files

| File | Change |
|------|--------|
| <!-- e.g. SubscriptionManager.swift --> | <!-- Cleared cached entitlement state before reading from StoreKit on cold launch. --> |

## How was this verified

<!-- One or both of: a regression test, and/or a manual reproduction confirming the fix. -->

- Regression test added:
  - <!-- e.g. SubscriptionManagerTests.coldLaunchClearsCachedEntitlement — fails on parent commit, passes on this commit. -->
- Manual verification:
  - <!-- e.g. Reproduced the bug per the issue's repro steps. After this fix, the bug no longer occurs. -->

## Verification

- [ ] A regression test exists that would have caught this bug
- [ ] Affected tests pass locally
- [ ] Full test suite passes locally
- [ ] Manual reproduction shows the bug is fixed
- [ ] CI is green

## Platforms / runtimes tested

- [ ] iPad (physical device)
- [ ] iPad simulator
- [ ] macOS
- [ ] Web
- [ ] N/A — not a UI bug

## Risk

<!-- One sentence. Is this change isolated? Could it affect other features? -->

## Scope confirmation

- [ ] This PR addresses only the linked bug and does not bundle unrelated changes.
- [ ] Commits are signed (DCO `-s` and cryptographic signing).
- [ ] No `--no-verify` or other hook bypasses were used.
