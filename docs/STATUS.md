# AutoHunter status

Updated 2026-08-10. This is the live progress record for the Northglass rebuild.

## Active objective

Publish the private vehicle-intelligence product as **AutoHunter**, a Northglass Product, at
`https://autohunter.northglass.io`. It must provide invited users independent magic-link sessions,
owned searches, review queues, dispositions, report archives, and email reports over shared
canonical inventory. Scheduled inputs must be licensed or user-authorized and must report coverage
truthfully.

## Completed

- Recovered the paused predecessor lease watcher and extracted its useful report structure:
  bottom line, new or changed offers, normalized effective monthly cost, caveats, signed benchmarks,
  watch items, and source health. Its generative browsing runtime remains disabled.
- Recorded the accepted private multi-user design in ADR-011 and the AutoHunter/source architecture
  in ADR-012.
- Added invite-only Supabase magic links, active-profile claiming, per-user searches and matches,
  independent decisions, per-user digest history, administrator invitations, and ownership
  reassignment while keeping the `catcht` application schema server-only.
- Rebuilt the responsive application and email surfaces with the AutoHunter identity and exact
  endorsement `a Northglass Product`.
- Promoted the in-app `A`-road-destination mark into a tested, editable identity kit with a
  standalone adaptive symbol, wordmark, horizontal lockup, square app icon, explicit 16/32 favicon
  variants, and separate endorsement guidance. Install metadata now uses the canonical app icon.
- Added report history and report detail pages. Report reads constrain both profile and report ID;
  cross-user IDs return 404.
- Separated lease intelligence into active offers, signed benchmarks, and market signals. Effective
  monthly math models first payment, acquisition fees, nonrefundable drive-off, refundable deposits,
  term, mileage, and tax treatment explicitly.
- Added licensed MarketCheck inventory, Auto.dev inventory, and MarketCheck OEM-incentives adapters,
  plus a dedicated-label GOG importer. A canonical vehicle can attach to several users' searches
  without duplicating their decisions.
- Verified the GOG importer against the real labeled Gmail format. It separates multiple reference-
  style links into distinct offers, keeps economics local to each offer, unwraps approved mail
  redirects, strips tracking parameters, and rejects mailbox, asset, homepage, and category links.
- Retired the tracked eight-row predecessor SQLite cache after recording its useful lease/finance
  field model in ADR-012. AutoHunter Postgres is the only live product data store.
- Audited production role provisioning and added the missing least-privilege grants for profiles,
  per-search matches, and per-user decisions, with a regression test.
- Hardened feature evidence so generic adaptive cruise is not mistaken for lane centering or
  hands-free driving. Manufacturer/package evidence remains confirmed, expected, or unknown.
- Added bounded first-party NHTSA crash-rating and model-year recall context. It shares results by
  model group, stores only minimal campaign facts, preserves unrated status, and leaves specific
  open-recall determination to the linked official VIN check.
- Replaced primary runtime, package, scheduler, template, and public documentation names with
  AutoHunter. Historical database identifiers remain only where migration compatibility requires
  them.
- Applied every additive production migration, including lease roles, NHTSA context, private
  multi-user ownership, legacy least-privilege role compatibility, and the jitter-tolerant daily
  digest cadence.
- Configured three active private profiles. Two profiles have reports enabled; the third remains
  disabled until its owner opts in. Katie's seven lease searches and recovered authorized market
  signal are in her own queue.
- Configured hosted Supabase Auth, branded templates, the invite hook, canonical redirect origin,
  custom SMTP, and the verified `carhunt@northglass.io` sender.
- Deployed the Vercel application as `autohunter`, attached Cloudflare DNS, and verified
  `https://autohunter.northglass.io` as the canonical HTTPS origin.
- Consumed a real administrator magic link and verified the authenticated production dashboard.
  Sent and rendered one administrator-only production report from the Northglass sender; its run is
  durably recorded as sent with 12 fresh finds.
- Installed the pinned read-only GOG bridge, created the dedicated Gmail label, and replaced the old
  mailbox runtime with an integrity-pinned fixed profile. A successful 45-day import found five
  authorized messages and accepted one correctly classified market signal without persisting raw
  mailbox content.
- Added a narrow Hermes schedule for the fixed mailbox-import profile. The predecessor Leasehackr
  and Mookmobile jobs remain paused and are explicitly named `SUPERSEDED`.
- Made scheduled digest responses aggregate-only. Per-profile identifiers and mail-provider message
  IDs remain in the private report store and can no longer flow into public scheduler logs.
- Renamed the predecessor Camoufox commands as `legacy:*` migration utilities and made them exit
  before config access or browser launch unless the operator records the exact written-permission
  attestation. The licensed and authorized `platform:*` path is unaffected.
- Verified the prompt-free Agent-vault service-account paths for Codex, Claude, and Hermes. The
  separately scoped project-Environment health check passes, although its mapped-profile launcher
  still fails closed; AutoHunter production no longer depends on that launcher. Claude's Cloudflare
  API and documentation bindings are connected read-only, while optional write-capable bindings
  remain denied.
- Published the reviewed tree to the public `Northglass-Labs/autohunter` repository with a clean
  root history, Northglass-only commit identity, secret scanning, push protection, Dependabot,
  private vulnerability reporting, and hardened merge settings. The predecessor's private history
  remains only in its private repository and local archive refs.
- Installed all four required GitHub Actions secrets. The non-exportable Vercel capabilities were
  rotated and synchronized in memory; the licensed MarketCheck key crossed from the predecessor
  repository only as one-time RSA-OAEP ciphertext, and the temporary migration workflow was then
  removed.
- Connected Vercel to `Northglass-Labs/autohunter` on `main` and set the Git production root to
  `catcht`.
- Tightened the database/collector contract so every saved search has a five-digit ZIP. The
  regression first failed against the legacy lease rows, the private production lease location was
  populated without entering the public repository, the additive migration was applied, and all 30
  pgTAP assertions now pass.
- Ran two consecutive canonical hosted cycles (`31376071369`, `31376216288`). Each completed 34
  searches, normalized 168 MarketCheck matches, and completed NHTSA enrichment. The immediate
  retry kept the store at 165 canonical rows and created no second digest run; both enabled profiles
  were correctly `not_due`.
- Added permanent canonical-origin redirects for the three predecessor hostnames so historical links
  move to `autohunter.northglass.io` without preserving the Mookmobile identity.
- Added a supersession notice to the private predecessor repository, disabled its scheduled
  collector, and archived it. HomeLab now records AutoHunter and ADR-055 as the current production
  boundary.

## Fresh complete local verification

- Web unit/integration: 110 tests across 31 files pass, including the exported identity contract and
  the aggregate-only digest response contract.
- Local database: every migration applies from empty state; 30 pgTAP assertions pass, including the
  search-ZIP contract, 23-hour cadence, and the hosted-advisor foreign-key index.
- Browser E2E: 12 desktop/mobile stories pass, including real Mailpit magic links, anonymous
  redirects, sign-out, queue actions, search creation, invitation, ownership transfer, real HTTPS
  images/links, report archive, and cross-user isolation.
- GitHub CI requires those database and browser stories in addition to unit, lint, build, and
  dependency gates. Actions are commit-pinned and checkout credentials are not persisted. Public
  run `31374662816` passed all three web, collector, and database/browser jobs.
- Next.js lint, TypeScript, and optimized production build pass.
- Collector: 89 tests pass, including the fixed 45-day authorized-mail lookback and both sides of
  the fail-closed legacy-browser permission gate.
- Production dependency audits for both packages report zero known vulnerabilities.
- A sealed standard repository security review found one low-severity privacy issue in the digest
  completion payload: per-profile and mail-provider identifiers could reach public Actions logs.
  The response is now aggregate-only, a regression test proves the private values stay absent, and
  provider state still persists privately for idempotency and report history.
- Fresh scans of the exact 209-file publishable working tree report zero Gitleaks findings. Semgrep's
  JavaScript, TypeScript, and OWASP Top Ten rules scanned 189 applicable files with zero findings and
  zero scan errors.
- Hosted Supabase advisors report zero security errors. The actionable missing foreign-key index is
  fixed in production; remaining performance notices are expected unused-index information for a
  young low-volume database. Password-leak and multiple-MFA warnings do not apply to the deliberate
  passwordless one-time email-link surface.

## Verified production state

- The additive migrations are applied to the existing Supabase project. The private application
  role is least-privilege; deletion and Auth-token mutation attempts are denied. Its historical
  internal identifier remains only because the encrypted production URL cannot be reconstructed.
- The dashboard currently has 165 canonical licensed listings, all with source links and 164 with a
  primary listing photograph, plus per-user matches and source-health evidence.
- Anonymous `/` redirects to `/login`; the login page returns 200; collector, ingest, and digest
  routes reject missing machine credentials; security headers are present.
- A browser accessibility audit found no WCAG A/AA violations. One automated contrast check remains
  inconclusive because the branded background is a gradient and is covered by visual review.
- The Gmail bridge and report trigger are independently idempotent. Product data remains in the
  private Postgres schema; mailbox message bodies and identities are not copied into AutoHunter.

## Current operational follow-ups

1. GitHub Actions now owns the daily 10:17 UTC collection cycle. Treat a missing or stale source run
   as an incident; do not re-enable the archived predecessor schedule.
2. Auto.dev remains visibly unavailable until an optional production credential is provisioned.
   MarketCheck is the active licensed inventory provider; OEM incentives currently return healthy
   empty results.
3. One photo-verification item still reports `customer_verification_required`. Inventory, queues,
   and reports correctly continue without treating it as verified equipment evidence.
4. The recurring 1Password desktop prompt is isolated to the optional legacy desktop CLI
   integration. Disabling that setting requires a fresh explicit user confirmation; unattended
   Codex, Claude, and Hermes paths no longer rely on it.

## Operating boundaries

- No direct Leasehackr, Cars.com, CarGurus, TrueCar, AutoTempest, or Autotrader extraction without
  current written permission or a licensed feed.
- Missing credentials, plan limits, policy refusals, parser drift, and stale data remain visible in
  source health.
- The first external email goes only to the administrator. Scheduler retries and report delivery
  must prove idempotent before broader delivery.
- No personal email, private location, mailbox content, credential, or secret-shaped value may enter
  the public repository, logs, browser bundle, persisted listing URLs, or documentation.
