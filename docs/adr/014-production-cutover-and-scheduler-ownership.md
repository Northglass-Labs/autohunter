---
title: AutoHunter production separates licensed collection from authorized mailbox import
status: accepted
date: 2026-08-10
supersedes: ADR-012 open production validation and predecessor scheduler ownership
---

# ADR-014: Production cutover and scheduler ownership

## Context

AutoHunter now has a working canonical deployment, private multi-user Auth, licensed inventory,
authorized lease intelligence, and deterministic reports. The predecessor system mixed browser
research, mailbox discovery, summarization, and email delivery in broad agent prompts. That made its
coverage and operational authority difficult to audit. Ordinary daily schedulers can also drift by
several minutes; a strict 24-hour elapsed-time check can unintentionally skip the next day's report.

The production database and encrypted platform URLs contain a historical internal application-role
identifier. Replacing that identifier would require rotating an opaque runtime URL during the same
cutover without improving its already verified least-privilege grants.

## Decision

1. `https://autohunter.northglass.io` is the canonical production origin. Vercel hosts the Next.js
   application and Cloudflare owns its DNS record. Hosted Supabase owns private Postgres state and
   invite-only email-link identity.
2. GitHub Actions owns licensed inventory collection and report triggering. It runs
   `platform:cycle` at 10:17 UTC with read-only repository permissions, pinned actions, a
   non-overlapping concurrency group, bounded timeout, and repository secrets injected only into
   the required steps.
3. Report eligibility uses a 23-hour minimum elapsed interval plus a profile-and-calendar-date
   unique run key. This tolerates scheduler jitter while keeping retries and duplicate invocations
   idempotent.
4. Authorized Gmail discovery is a separate host operation. Hermes may invoke exactly one audited
   1Password fixed profile, which runs the pinned GOG binary in read-only/no-send mode against the
   dedicated `AutoHunter/Lease Inputs` label. It cannot choose arbitrary commands, profiles,
   mailbox queries, recipients, or write actions.
5. The Gmail query uses a 45-day lookback so monthly editorial signals remain visible. Normalized
   public facts and source links may be ingested; raw message bodies, mailbox identity, recipients,
   and private redirect URLs may not be persisted.
6. The application and digest sender own all report generation and delivery. Hermes and GOG never
   compose or send AutoHunter reports.
7. The predecessor Leasehackr research job and Mookmobile collector job remain paused and are named
   `SUPERSEDED`. Their artifacts are historical evidence, not a second scheduler or source of truth.
8. The historical internal database-role identifier remains temporarily, with current
   least-privilege grants verified by regression tests and production denial checks. New installs
   use the neutral AutoHunter role created by the provisioning script.

## Consequences

- Each scheduled component has a narrow, testable authority boundary and an observable owner.
- Mailbox access is optional infrastructure, not a hidden production dependency.
- A source failure cannot be papered over by an agent-generated report; source health and report
  state remain in AutoHunter.
- Monthly Leasehackr research can feed the queue without crawling Leasehackr or retaining personal
  email content.
- The compatibility role avoids a risky credential cutover but remains an internal migration detail
  that must not shape new installations or public naming.
- Production release requires one successful manually dispatched GitHub Actions cycle after the
  clean Northglass repository and its scoped secrets are configured.
