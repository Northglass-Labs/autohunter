---
title: The lease-alert importer runs from a launchd job through an operator-installed agent_fields profile
status: accepted (installation pending owner review)
date: 2026-10-10
amends: ADR-014 (decision 4)
---

# ADR-019: Lease-alert importer host schedule

## Context

ADR-014 made the authorized Gmail import a separate host operation invoked by Hermes through one
audited 1Password profile. Hermes has since been retired, and the importer has not run since
2026-08-10. A manual run of its existing profile on 2026-10-10 could not authenticate to the
application. That profile takes the application origin and ingest secret from a 1Password
Environment. The origin is likely the legacy hostname, whose permanent redirect drops the bearer
token on the cross-origin hop. The host scheduler runs only `agent_fields` profiles; Environment
profiles are callable through the MCP plugin alone.

A local probe against a mock application showed the importer, its Keychain lookup and the pinned
GOG binary still work: the Gmail search succeeded and reported a clean empty run.

## Decision

1. A user launchd job runs the importer daily at 05:45 America/New_York, before the scheduled
   collection cycle, through the host scheduler's `agent_fields` path.
2. The profile pins the canonical application origin as a non-secret static value, so a stale or
   legacy origin cannot be injected. The ingest secret comes from a dedicated Agent-vault item.
3. Command, working directory, mailbox query, read-only GOG flags and integrity pins are unchanged
   from the reviewed importer profile. The importer still reads only the dedicated label, read-only
   and no-send.
4. The owner reviews and installs the profile and the launchd job. Neither a prompt nor this
   repository can install or change a trusted profile.

## Consequences

- Lease inputs reach the daily report again once the label filter is in place and the profile is
  installed.
- An importer outage is visible in reports and the dashboard: the source shows as stale after
  48 hours.
- The ingest secret now has one more derived copy, in the Agent vault. A rotation must update
  Vercel, GitHub Actions, the 1Password Environment and that item together.
