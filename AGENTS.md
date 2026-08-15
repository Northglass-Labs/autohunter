# AGENTS.md — AutoHunter

Read `README.md`, `CLAUDE.md`, `docs/STATUS.md`, and ADR-012 before changing behavior. Keep
`docs/STATUS.md` current while work is in progress; record significant architecture changes in a
new ADR immediately.

## Product boundary

AutoHunter is an invite-only Northglass vehicle-intelligence product. `collector/` retrieves only
licensed feeds, expressly authorized notifications, or manual imports and emits explicit source
health. `catcht/` is the Next.js/Supabase Auth/private Postgres/reporting app. The normal runtime
does not depend on Hermes, OpenClaw, a browser daemon, or mailbox-wide access.

The original manual-car monitor and `catcht` schema names are migration compatibility details.
Public product copy, package names, sender copy, and deployment surfaces use **AutoHunter** and the
exact endorsement **a Northglass Product**.

## Non-negotiable correctness

- Write or update a failing test before behavior fixes.
- Never mark a benchmark or market signal as a current lease offer.
- Never turn generic adaptive cruise or lane-departure warning text into lane centering or
  hands-free capability. Equipment is `confirmed`, `expected`, or `unknown` with evidence.
  Summary text (headings, descriptions) marks at most `expected`; only listing-detail evidence
  confirms, and `EXPECTED_EQUIPMENT_RULES` entries must be factory-standard fitment only.
- Recheck make/model/trim/year/price/mileage/radius and lease limits after provider normalization.
- Keep provider queries bounded, cache shared detail requests, expire stale offers, and preserve
  one per-search match when one canonical vehicle fits multiple users.
- Never enable direct marketplace crawling to work around a 403, CAPTCHA, robots policy, or terms
  restriction. Report the source as unavailable/challenged.
- Mailbox import is read-only and label-bounded. Never persist raw email bodies or account identity.
- NHTSA enrichment is model-year bounded and rate controlled. Never bulk-query VINs, persist recall
  narratives, or describe model-year campaigns as open recalls on the listed VIN.

## Auth and data isolation

- Supabase Auth supplies identity only. Every protected page, route, and Server Action must call
  `currentUser()`/`requireUser()` and authorize against the private profile.
- The `catcht` schema stays server-only and outside browser-facing Supabase roles/Data API.
- Canonical listings/evidence are global. Searches, listing matches, decisions, digest runs,
  reports, and resend state are scoped to `user_profiles.id`.
- The collector receives opaque search definitions only—never email, role, Auth ID, or cookie data.
- Report lookup must constrain both report ID and owning user ID; a missing or foreign report is a
  404 with no leaked content.

## Product identity

- Keep the AutoHunter `A`-road-destination mark as the product symbol; it is deliberately not the
  Northglass ensō.
- Keep the live lockup, install metadata, favicon set, and `catcht/public/brand/` exports aligned.
  The brand contract test is the drift gate.
- Keep `a Northglass Product` as quiet supporting provenance copy, separate from the primary
  wordmark in exported assets.

## Secrets and public identity

- Keep secrets in scoped platform stores, 1Password, or OS credential storage. Never place them in
  code, docs, JSON profiles, command arguments, logs, screenshots, HTML, or persisted URLs.
- Northglass/public material uses `hello@northglass.io` or the GitHub noreply author address. Do not
  commit personal email addresses or household account details.
- Primary collector variables are `AUTOHUNTER_*`; `CAR_HUNT_*` and `CATCHT_*` are temporary read
  fallbacks only.

## Required checks

```bash
(cd catcht && npm test && npm run test:db && npm run test:e2e && npm run lint && npm run build && npm audit --omit=dev)
(cd collector && npm test && npm audit --omit=dev)
```

Use `npm run platform:health -- --config platform.example.json` only for a deliberate live no-write
check. Database changes require a new Supabase migration and pgTAP coverage. Auth, ownership,
reports, or protected routes require real Mailpit-backed Playwright coverage on desktop and mobile.

## Key files

| File | Purpose |
|---|---|
| `collector/src/platform.mjs` | adapter orchestration, deduplication, health, ingest |
| `collector/src/vehicle-intelligence.mjs` | family targets and evidence-backed feature mapping |
| `collector/src/enrichers/nhtsa.mjs` | bounded official crash-rating and recall context |
| `catcht/src/lib/ranking.ts` | purchase, lease, family, and manual-proof evaluation |
| `catcht/src/lib/dal.ts` | private persistence, ownership, digest/report history |
| `catcht/src/lib/email-template.ts` | deterministic AutoHunter daily report email |
| `catcht/src/lib/auth.ts` | Supabase identity to invited-profile authorization |
| `catcht/src/components/autohunter-brand.tsx` | canonical live mark, wordmark, and endorsement lockup |
| `catcht/public/brand/` | editable symbol, wordmark, lockup, app-icon, and favicon exports |
| `catcht/e2e/auth-and-isolation.spec.ts` | desktop/mobile Auth and isolation stories |
| `docs/adr/012-autohunter-product-and-source-architecture.md` | current architecture decision |
| `docs/adr/013-nhtsa-safety-evidence.md` | official safety-data boundary |
| `docs/adr/014-production-cutover-and-scheduler-ownership.md` | production scheduler ownership |
| `docs/STATUS.md` | verified state and next operation |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This repository uses Next.js 16. Read the relevant guide under `catcht/node_modules/next/dist/docs/`
before writing framework code, and follow its current async params/searchParams, Proxy, caching,
navigation, and error-handling contracts.

<!-- END:nextjs-agent-rules -->
