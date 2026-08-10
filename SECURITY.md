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
