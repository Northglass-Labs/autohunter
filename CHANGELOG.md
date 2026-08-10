# Changelog

## Unreleased — AutoHunter

- rebrands the private vehicle platform as AutoHunter, a Northglass Product
- adds invite-only Supabase magic links, profile-owned searches, independent review decisions,
  profile-scoped reports, and administrator invitations
- adds responsive EV, gas/hybrid, lease, and enthusiast queues with real listing images and source
  links
- separates active lease offers, signed benchmarks, and incomplete market signals
- normalizes effective monthly lease cost with explicit first-payment, fee, deposit, mileage, tax,
  and term semantics
- adds licensed Auto.dev inventory and MarketCheck OEM-incentive adapters alongside MarketCheck
  inventory
- adds a read-only, dedicated-label GOG importer for user-authorized lease notifications without
  persisting mailbox content or identities
- adds deterministic web/email report sections and a private report archive
- adds a 23-hour daily-report eligibility window with calendar-date idempotency and a bounded
  report-trigger CLI for scheduler retries
- installs the authorized Gmail importer as a separate, fixed-profile read-only operation with a
  45-day editorial lookback and no raw-message persistence
- hardens model-year/package intelligence so generic adaptive cruise is never presented as lane
  centering or hands-free driving
- adds desktop/mobile E2E coverage for Auth, profile isolation, actions, invitations, ownership
  transfer, images, source links, and report IDOR boundaries
- replaces predecessor deployment, package, scheduler, and public documentation identities while
  retaining only the internal schema identifiers required for additive migration compatibility
- enforces the same five-digit ZIP contract in the database, web form, and hosted collector
- permanently redirects predecessor product origins to `autohunter.northglass.io` and retires the
  private predecessor repository and scheduler after consecutive idempotent production cycles

## Pre-AutoHunter history

Earlier private releases established the reusable foundations: normalized vehicle offers,
source-health recording, licensed MarketCheck collection, exact-VIN correlation, bounded photo
verification, reversible decisions, idempotent reports, Vercel/Supabase deployment, and portable
daily scheduling. AutoHunter supersedes those product identities and operational profiles.
