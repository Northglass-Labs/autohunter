# Security policy

## Supported version

AutoHunter is an actively maintained private product. Only the current `main` branch and canonical
production deployment are supported.

## Reporting a vulnerability

Please report suspected vulnerabilities privately to `hello@northglass.io`. Do not include active
credentials, personal mailbox content, household data, or production records in the report, and do
not open a public issue for an undisclosed vulnerability.

AutoHunter does not run a public bug-bounty program. Please avoid destructive testing, denial of
service, automated account creation, access-control bypass attempts against other users, or source
collection outside the documented licensed and authorized boundaries.

## Product boundary

The public source repository contains no production credentials or household identities. Hosted
configuration, invite records, mailbox authorization, and provider entitlements live in scoped
platform or credential stores. A cloned repository is not a production instance and receives no
access to Northglass infrastructure.

## Dependency audit gate

CI fails on any high or critical npm advisory. Production dependencies are audited with no
exceptions (`npm audit --omit=dev`). The full audit runs through `.github/scripts/audit-gate.mjs`,
which accepts only entries in `.github/audit-allowlist.json`. Each entry names one advisory on one
package, gives a reason, and expires, after which it blocks again. Use an exception only for a
development dependency with no patched release.
