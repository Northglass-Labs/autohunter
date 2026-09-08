# AutoHunter status

## Completed — W222 value hunt and product polish (2026-09-08)

Production: PR #12 (`ed630bf`) and the dealer-title follow-up PR #13 (`7496c0e`) are merged.
Vercel deployment `dpl_FY4aSwsHsUs4iXqUD9Z7Qoi3BFGG` is READY at
<https://autohunter.northglass.io>. Fresh HTTP checks return 200 for login and redirect anonymous
queue/guide requests to login. The post-deploy 10-minute production error/fatal log query returned
no entries; this is a bounded observation, not a claim of exhaustive production coverage.

Two owner-specific searches are active: 2018–2020 S560 and S450 used gasoline sedans, up to
$25,000 asking price, with a provisional discovery ceiling of 120,000 miles. They inherit the
owner's existing search area and 250-mile radius. AWD and RWD are eligible; coupes and S560e
hybrids are excluded. Ten desired features favor equipment worth investigating; no optional
package is required while descriptions remain incomplete. Other users' searches are unchanged.

Mercedes US brochures for 2018–2020 establish standard wired CarPlay/Android Auto and optional
Premium, Driver Assistance, Warmth & Comfort, AMG Line Exterior and High-End 3D audio. MAGIC BODY
CONTROL is unavailable with 4MATIC, and restricted to the S560 sedan in the 2019/2020 brochures.
The supplied blanket powertrain reliability ranking is not established by these sources. The
protected [buying guide](https://autohunter.northglass.io/guides/w222) records sources and inspection
steps. ADR-016 records body-style filtering and conservative equipment evidence. Generic adaptive
cruise plus lane-keeping text cannot establish lane centering; listing summaries only establish
expected equipment, and optional packages are never treated as factory-standard fitment.

The interface now has readable equipment controls, one-click presets, visible evidence and
S-Class inspection checks. HTML and plain-text emails include complete candidate details,
price changes, mobile-friendly actions and source freshness. Sources older than 48 hours cannot
appear healthy. URL-shaped dealer titles fall back to year/make/model/trim both during future
normalization and when existing queue/email records are read; original stored source titles are
preserved. Manual workflow dispatch defaults to collection only; the daily digest schedule is
unchanged and its next run will use the revised renderer.

The additive live migration is `20260908064749_w222_body_style`. Browser-facing anon and
authenticated roles still have no `catcht` schema access, and all 35 pre-existing searches remain.
Collection-only run [34197218704](https://github.com/Northglass-Labs/autohunter/actions/runs/34197218704)
passed with the digest step skipped: 10 groups per inventory provider, MarketCheck 132 accepted
and Auto.dev 94 accepted. Four eligible W222 leads were persisted:

| Lead | Asking price | Mileage |
|---|---:|---:|
| 2019 S560 | $23,995 | 106,778 |
| 2018 S560 | $24,600 | 100,234 |
| 2020 S450 | $23,490 | 106,442 |
| 2018 S450 | $23,790 | 84,053 |

The 2019 S560 dealer page independently corroborates its price, mileage and 4MATIC configuration.
Desired option packages remain unknown on these leads; phone integration has explicit detail
evidence. A build sheet, current availability, itemized total price, service history and independent
Mercedes inspection are the next buying steps. MarketCheck reports a 100-mile plan cap despite
the saved 250-mile radius; the UI exposes this coverage limit. Authorized email imports remain
stale since August 10. Today's inventory providers succeeded, superseding the old quota incident.

Fresh release verification: 133 web tests, 117 collector tests, 39 pgTAP checks and all 16 real
Mailpit-backed desktop/mobile Playwright stories pass. Lint and production build pass; both
production and full CI dependency audits report zero vulnerabilities. PR #13 CI run
[34197776587](https://github.com/Northglass-Labs/autohunter/actions/runs/34197776587) passed all jobs.
Desktop/mobile preset, guide and synthetic email layouts were inspected. This refresh sent no
email; email delivery was exercised only in local Mailpit tests.

Homarr is complete: a private Home & Apps tile with all three responsive layouts, verified
database/config backups and restart persistence. Existing tiles are preserved. HomeLab commits
`d85f2bd` and `f040494` record the change, rollback and icon correction: the app-origin image policy
blocks external embedding, so the tile uses the byte-identical canonical public repository SVG,
verified to load in a browser. The dashboard and destination login return 200. Visual inspection
of the private board remains limited by Homarr login. HomeLab's fleet baseline is recorded in
`docs/validation-notes/2026-09-08-autohunter-homarr.md` in that repository.

Historical checkpoints below preserve earlier diagnoses. Use the completed checkpoint above for
the current release state.

## Historical incident — MarketCheck quota exhaustion (2026-08-17; healthy again 2026-09-08)

- Evidence: the 2026-08-17 cycle ran dry mid-flight (inventory succeeded with 157 accepted, then
  the incentives adapter hit `rate_limited` two calls in); every scheduled cycle since Aug 18
  dies `rate_limited` on its first request. No MarketCheck ingest since Aug 17 10:48 UTC; the
  remaining 146 MarketCheck listings expire ~Aug 21 10:48 UTC. Auto.dev (154 listings) and NHTSA
  remain green, so the queue degrades to single-source rather than going dark. Listing expiry is
  deliberate truth-keeping and is not being extended.
- Probable cause: the 2026-08-15 `detailFetchLimit` raise (3→20; ~40 provider calls/day) plus
  five same-day verification cycles (~200 calls) overran the plan's monthly window.
- Mitigation shipped: `detailFetchLimit` lowered to 8 (≈28 calls/day ≈ 870/month), which still
  converges the remaining unenriched queue in ~2–3 weeks via the enriched-skip list. Service
  resumes automatically when the provider window resets; do not dispatch manual cycles while the
  source is `rate_limited` (each attempt burns ~2 calls and cannot succeed).
- Operator actions: read the actual plan tier, usage, and reset date off the MarketCheck
  dashboard (agents cannot see it) and adjust `detailFetchLimit` to the plan's real headroom or
  upgrade the plan if 20-detail velocity is wanted. Still outstanding alongside: the 1P
  Environment `APP_URL` fix (email imports stuck since Aug 10) and the Auto.dev key rotation
  (due Aug 16).

## Follow-up checkpoint (2026-08-16)

- This checkpoint records a diagnostic pass performed against `6fdc59b`, when `main` was clean and
  no application behavior had changed. It then merged as part of PR #9 (`0e0ae12`), which does
  change behavior: failed email import cycles now post a visible `email_alert` source run with a
  stage-coded reason instead of exiting silently.
- The Auto.dev starter key has not been rotated yet. Current provider documentation requires the
  developer dashboard, and no controllable browser session was available. Agent-vault health is
  ready and no credential value was read, copied, or changed.
- The authorized Gmail boundary is healthy: GOG v0.34.0 opened its file keyring, exchanged the
  stored OAuth refresh token successfully, and found four messages under the bounded
  `AutoHunter/Lease Inputs` query without exposing or persisting their bodies.
- A timestamped `autohunter-production-email-importer` run at 2026-08-16 04:07:38 UTC produced a
  production `308` followed by `401` on `/api/collector/config`. The canonical route does not
  redirect, so this is positive evidence that the trusted Environment's non-secret `APP_URL` still
  targets a predecessor hostname; the redirect drops the authorization header before the canonical
  request. The profile's integrity pins and Environment health check both pass.
- No new `gog-authorized-email-v1` source-run row was written; the latest production row remains
  2026-08-10 08:24:01 UTC. Resume by unlocking 1Password, confirming and replacing only `APP_URL`
  with `https://autohunter.northglass.io`, then rerun the importer and verify a fresh source-run row.
  Separately connect an authenticated Auto.dev dashboard session to rotate the exposed key and
  replace it in GitHub Actions and the scoped Agent-vault item without moving it through chat.

## Session checkpoint (closed 2026-08-15)

- Queue controls, swipe decisions, Auto.dev enablement, and Taycan coverage shipped through PR #6
  (`c14f7c6`); the wording-only follow-up PR #7 left `main` at `8cced4c`. Final main CI run
  `31876685707` passed collector, web, database, and desktop/mobile browser jobs.
- Vercel reports the canonical production deployment ready. Anonymous `/` redirects to `/login`,
  `/login` returns HTTP 200, and the post-deploy production error scan found zero errors.
- Hosted Supabase has exactly one active Porsche Taycan target. Collector run `31875578317`
  completed 29 searches and ingested 232 candidates; Auto.dev remained healthy and the run sent no
  email.
- Resume with credential hygiene: rotate the Auto.dev starter key exposed in the interrupted chat,
  then update both GitHub Actions and the scoped Agent-vault item. No macOS reminder was created
  because Reminders access remained `Not determined`; the rotation deadline is 2026-08-16.
- After rotation, obtain positive Gmail-import evidence. The 1Password Environment health check is
  healthy, but production still has no `gog-authorized-email-v1` source run newer than 2026-08-10.
- Session cleanup moved regenerated Next.js and Playwright output to Trash, pruned stale remote refs,
  and removed four local branches whose PRs were already merged. Dependency caches and unrelated
  running services were preserved.

## Queue controls and source coverage (2026-08-15, third pass)

- Added shareable queue price caps with separate purchase-price and effective-monthly lease
  boundaries. Malformed URL values are rejected, missing prices do not slip through an active cap,
  and unlike economics are never compared.
- Added touch and pointer review gestures in the Finds and Pending queues: right records
  Interested and left records Pass through the existing authenticated disposition action. Vertical
  scrolling, links, forms, and already-decided queues remain unaffected; the visible buttons stay
  available as the accessible fallback.
- Stored the Auto.dev starter credential in the scoped Agent vault and GitHub Actions secret store
  without entering repository files or command arguments. Hosted cycle `31875249120` then proved
  the adapter live: 9 searches, 163 discovered rows, and 74 accepted rows.
- Added an active Porsche Taycan target matching the existing Audi e-tron GT boundary (used,
  2022-2025, $70,000 cap, $50,000 target) through an additive production migration. Hosted cycle
  `31875578317` completed all 29 searches, discovered and ingested 232 accepted candidates across
  licensed sources, and sent no email; no in-boundary Taycan match was available in that snapshot.
- The previously failing 1Password Environment health check is healthy again. The fixed email
  profile was invoked, but its contract intentionally returns no child status and production still
  has no newer `gog-authorized-email-v1` row than 2026-08-10, so the importer remains unverified.
- Fresh verification: collector 103/103; web 126/126 unit tests, ESLint, TypeScript and optimized
  build; 31/31 pgTAP assertions; 14/14 Playwright desktop/mobile stories; both production
  dependency audits report zero vulnerabilities. Desktop and mobile price-filter layouts were
  also reviewed from fresh screenshots.

## Deal-browser UI and evidence persistence (2026-08-15, second pass)

Owner feedback after first phone login: the dashboard buried the deals and feature evidence still
read as failed. Root causes and fixes (ADR-015 addendum):

- The ingest upsert overwrote stored feature evidence every cycle, so detail-confirmed equipment
  reverted to `unknown` the next day. Ingest now merges per feature key: persisted higher-ranked
  evidence survives unless the fresh inference is itself detail-enriched.
- The collector re-spent its detail budget on the same cheapest listings. The collector config now
  serves `enrichedListingIds`, the MarketCheck adapter skips them, and production
  `detailFetchLimit` rose from 3 to 20 (the adapter's long-standing clamp ceiling), so the whole
  active queue converges to detail-grade evidence within days.
- The dashboard was rebuilt as a deal browser: slim header, tap-through filter chips (queue, lane,
  offer kind, per-model chips derived from the owner's saved searches, sort — no form submits),
  compact cards with named confirmed/expected feature chips and a collapsed "Evidence & checks"
  drawer, and an explanatory note when the lease lane has no active offers instead of a blank gap.
- Verification: collector 103/103; web 122/122 unit, ESLint, TypeScript + build, 30/30 pgTAP,
  12/12 Playwright desktop/mobile stories; desktop and mobile screenshots reviewed.

## Feature-evidence coverage sprint (2026-08-15)

- Repaired the local `car-hunt` → `autohunt` folder-rename fallout: 1pass-agent-plugin profile
  working directories and stale integrity pins were re-pointed and re-pinned to reviewed `main`
  content, the superseded `dev.car-hunt.email-alert-importer` and `dev.catcht.collector`
  LaunchAgents were booted out and archived, and the local Supabase kong/edge containers were
  recreated so their bind mounts leave the dead path. Repo, remotes, Vercel, DNS, and the daily
  GitHub Actions cycle were unaffected.
- Added the `provider_summary` evidence tier per ADR-015: feature patterns now run over provider
  search-response text (dealer headings, summary option arrays, Auto.dev retail descriptions) and
  can mark equipment `expected` on every accepted listing in the first pass. `confirmed` remains
  detail-evidence-only and the ingest contract now rejects confirmed evidence from any other
  source.
- Fixed dropped MarketCheck search-response fields: `std_seating`, root-level `carfax_1_owner`,
  `carfax_clean_title`, `exterior_color`, `interior_color`, and `dom` now populate seating, owner,
  title, color, and days-on-market intelligence without a detail fetch.
- Replaced the expected-equipment rule ladder with the exported declarative
  `EXPECTED_EQUIPMENT_RULES` table and extended precise factory-standard coverage to the lease
  targets (Lexus TX, Grand Highlander, CX-90, Telluride, Palisade, Aviator), SQ7, GV80, XC90
  Pilot Assist, MDX Type S, TX 500h Dynamic Rear Steering, and 2021+ GLS surround view.
- Broadened ADAS recognition: BlueCruise and ProPILOT Assist 2.x are hands-free when explicitly
  evidenced; bare ProPILOT Assist, Travel Assist, InnoDrive, and Active Driving Assistant Pro are
  hands-on lane centering; verified BMW package codes ZDH/ZDY/5AU decode alongside 2VH.
- `required_features` is now a real eligibility gate with the visible reason
  `required_feature_missing` (satisfied by confirmed or expected evidence; benchmarks and market
  signals stay visible). All stored searches currently have empty required features, so behavior
  changes only when an owner opts in.
- The MarketCheck detail budget now targets upgrade value (summary-expected features first) instead
  of cheapest-first, so the three daily detail fetches land where they can newly confirm equipment.
- Verification for this sprint: collector 102/102 tests; web 116/116 unit tests, ESLint,
  TypeScript + production build, 30/30 pgTAP assertions, 12/12 desktop/mobile Playwright stories;
  both production dependency audits report zero vulnerabilities.

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

- Web unit/integration: 126 tests across 33 files pass, including the queue-cap and swipe-decision
  contracts, exported identity contract, and aggregate-only digest response contract.
- Local database: every migration applies from empty state; 31 pgTAP assertions pass, including the
  Taycan target, search-ZIP contract, 23-hour cadence, and hosted-advisor foreign-key index.
- Browser E2E: 14 desktop/mobile stories pass, including a real swipe disposition, shareable price
  caps, real Mailpit magic links, anonymous
  redirects, sign-out, queue actions, search creation, invitation, ownership transfer, real HTTPS
  images/links, report archive, and cross-user isolation.
- GitHub CI requires those database and browser stories in addition to unit, lint, build, and
  dependency gates. Actions are commit-pinned and checkout credentials are not persisted. Final
  main run `31383917236` passed all three web, collector, and database/browser jobs on production
  commit `cb8805f5040a4b8dfbfecf51383e4dddba5c630c`.
- Next.js lint, TypeScript, and optimized production build pass.
- Collector: 103 tests pass, including the Taycan catalog target, fixed 45-day authorized-mail
  lookback, feature-evidence enrichment, and both sides of the fail-closed legacy-browser
  permission gate.
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
- At the final 2026-08-10 cutover audit, the dashboard retained 182 canonical licensed listings,
  all with source links and 181 with a primary listing photograph, plus per-user matches and
  source-health evidence. Treat these as a dated snapshot and query production before quoting a
  current inventory count.
- Two green Uptime Kuma monitors watch the canonical origin against the production revision.
- Anonymous `/` redirects to `/login`; the login page returns 200; collector, ingest, and digest
  routes reject missing machine credentials; security headers are present.
- A browser accessibility audit found no WCAG A/AA violations. One automated contrast check remains
  inconclusive because the branded background is a gradient and is covered by visual review.
- The Gmail bridge and report trigger are independently idempotent. Product data remains in the
  private Postgres schema; mailbox message bodies and identities are not copied into AutoHunter.

## Current operational follow-ups

1. GitHub Actions now owns the daily 10:17 UTC collection cycle. Treat a missing or stale source run
   as an incident; do not re-enable the archived predecessor schedule.
2. Auto.dev is live alongside MarketCheck. The starter key was exposed in the interrupted chat and
   its 2026-08-16 rotation is still pending because the provider dashboard was not available to the
   agent. Replace it in both GitHub Actions and the scoped Agent-vault item after the interactive
   provider rotation. The attempted macOS reminder was not created because Reminders access
   remained `Not determined`. OEM incentives currently return healthy empty results.
3. One photo-verification item still reports `customer_verification_required`. Inventory, queues,
   and reports correctly continue without treating it as verified equipment evidence.
4. The recurring 1Password desktop prompt is isolated to the optional legacy desktop CLI
   integration. Disabling that setting requires a fresh explicit user confirmation; unattended
   Codex, Claude, and Hermes paths no longer rely on it.
5. The 1Password Environment and GOG OAuth checks are healthy, but a timestamped fixed-profile run
   produced `308` then `401` at the collector-config boundary. Confirm that the Environment's
   non-secret `APP_URL` is canonical, correct it if it still names a predecessor host, then keep the
   Gmail importer on the follow-up list until an operator-observed run records a new
   `gog-authorized-email-v1` row in `catcht.source_runs`.

## Operating boundaries

- No direct Leasehackr, Cars.com, CarGurus, TrueCar, AutoTempest, or Autotrader extraction without
  current written permission or a licensed feed.
- Missing credentials, plan limits, policy refusals, parser drift, and stale data remain visible in
  source health.
- The first external email goes only to the administrator. Scheduler retries and report delivery
  must prove idempotent before broader delivery.
- No personal email, private location, mailbox content, credential, or secret-shaped value may enter
  the public repository, logs, browser bundle, persisted listing URLs, or documentation.
