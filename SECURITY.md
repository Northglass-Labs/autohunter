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

CI audits every npm package root. Production dependencies block on moderate, high, or critical
advisories with no exceptions (`audit-gate.mjs production`). The full dependency tree blocks on high
or critical advisories (`audit-gate.mjs full`) except entries in `.github/audit-allowlist.json`.
Each exception names one advisory on one package, gives a reason, and expires, after which it blocks
again. Malformed or duplicate exception policy, unknown severities, incomplete advisory graphs, and
advisories without stable identifiers fail the gate closed. Use an exception only for a development
dependency with no compatible patched release.

Pull requests also receive dependency review, and CodeQL analyzes JavaScript and TypeScript on pull
requests, `main`, and a weekly schedule. The Worker CI job retains a secret-free Wrangler dry-run
bundle with its SBOM and tracked-source manifest. Only a push to `main` in
`Northglass-Labs/autohunter` can request the scoped OIDC and repository permissions that attest that
artifact. GitHub must still have Actions and the relevant security features enabled, and branch or
ruleset settings must require these checks before they are enforcement rather than workflow policy.
