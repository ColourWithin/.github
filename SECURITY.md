# Security

## Reporting a vulnerability

**Do not file a public issue for a suspected vulnerability.**

Instead, use GitHub's private vulnerability reporting:

1. Go to the relevant repo on github.com.
2. Open the **Security** tab → **Report a vulnerability**.
3. Provide as much detail as possible — affected versions, reproduction steps, expected vs observed behaviour, and any evidence of exploitation.

Reports go directly to the maintainers and are not visible publicly until coordinated disclosure.

## What to expect

- **Acknowledgement:** within seven days of report.
- **Triage:** the maintainers will assess severity and reproducibility, and reply with an initial classification within fourteen days.
- **Fix timeline:** depends on severity. Critical issues affecting deployed user-facing apps are addressed first; lower-severity issues may be batched into the next regular release.
- **Disclosure:** once a fix ships, the reporter and the maintainers coordinate on the public disclosure note. The reporter is credited unless they request anonymity.

## Scope

In scope:

- Code in any repo under the [ColourWithin](https://github.com/ColourWithin) GitHub organisation.
- Deployed user-facing services owned by the org (e.g. `colourwithin.app`, `*.colourwithin.app`).

Out of scope:

- Third-party SDK behaviour we don't control (report upstream — we'll coordinate if there's a downstream impact).
- Social-engineering / phishing of org members (report to the platform vendor; org owners can also be informed).
- Automated scanner findings without proof of exploitability.

## Supported versions

Each repo's own `SECURITY.md` (if present) lists the versions actively supported. Where a repo does not override this org-level file, the convention is:

- The `main` branch and the most recently published release are supported.
- Older releases are supported only when explicitly tagged in the repo's release notes.
