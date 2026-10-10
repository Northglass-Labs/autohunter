# AutoHunter overhaul plan (October 2026)

This plan turns the 2026-10-10 requirements and quality audit into four sprints. Each item ships as a
focused pull request with tests written first, and `docs/STATUS.md` records each release. Status:
`[ ]` not started, `[~]` in progress, `[x]` done.

## What the audit found

- **Used-car ranking ignores price.**
  - No adapter supplies a market value, so every listing's `market_estimate` is empty.
  - Of 537 current eligible matches, price changes the score for 72. For those, it is measured
    against a provider MSRP field that is often not the original sticker.
  - One provider holds 43 of the top 50 picks, and several cars tie at the score cap.
  - Implausible prices from a feed (for example $190 for a 2024 SUV) are marked eligible.
- **Lease coverage is thin.** OEM programs reach 2 of the 7 searched models. The Leasehackr route has
  never delivered a candidate.
- **Failures go unnoticed.** Source outages ran for weeks without an alert, and monitoring checks only
  that the site is up.
- **The app is hard to adjust.**
  - Searches cannot be edited.
  - Report frequency cannot be set in the app.
  - The queue renders 250 cards at once.
  - A signed-out visit to report history returns a server error.
- **Sign-in** does not yet require that a session came from an email link.

## Sprint 1: results you can trust

1. [~] **Email-link sessions only.**
   - The app accepts a session only when it came from an email link, and never one from a
     password or anonymous sign-in (ADR-022).
   - Signed-out visits to `/reports` go to the login page.
2. [ ] **Implausible prices are not deals.**
   - A used listing priced far below its comparable listings, or below an absolute floor, is
     ineligible as `price_suspect`.
   - It is also kept out of other listings' comparables.
3. [ ] **Market value from comparable listings (ADR-023).**
   - Comparables are used listings seen in the last 90 days with the same make, model and trim
     family, within one model year.
   - Each comparable's price is adjusted for mileage and year.
   - The estimate is their median, with the number of comparables kept as evidence.
   - Used-car value scores price against that estimate, symmetric around market. Provider MSRP no
     longer scores used cars.
   - Cards and reports show how far a car is below or above market, and from how many comparables.
4. [ ] **Spread the 12 report picks** across searches: at most three from any one search, with any
   remaining slots filled by score.
5. [ ] **Lease hygiene.** Expired offers and terms shorter than 12 months are not eligible.
6. [ ] **Freshness health endpoint.** It returns only "ok" or "degraded" when a scheduled source
   stops returning results. An uptime monitor watches it.
7. [ ] **Rescore production.** After the ranking release:
   - run a collection-only cycle;
   - check the top picks by hand against their comparables;
   - record the result.

Sprint 1 is done when:
- every current used match has an estimate or a stated reason for none;
- no implausible price is eligible;
- the 12 picks span several searches;
- an outage of any scheduled source alerts within a day.

## Sprint 2: an app people can run themselves

1. [ ] **Edit a saved search in place.** Changing criteria sets `updated_at`, and matches are
   re-confirmed (ADR-020).
2. [ ] **Report settings per person:** frequency (daily, every third day, weekly) and a pause.
3. [ ] **A lighter queue:** 24 cards per lane with "Show more".
4. [ ] **Tidier cards:** display titles built from year, make, model and trim, and a placeholder
   when a listing photo fails.
5. [ ] **A short "How AutoHunter works" page** linked from the reports and the header.
6. [ ] **End-to-end stories** for each of the above, on desktop and phone viewports.

## Sprint 3: coverage (needs owner decisions)

1. [ ] **Lease near-misses.** When a search has no program within its caps, show the closest
   programs above them as context, never as offers.
2. [ ] **Authorized Leasehackr notifications.**
   - Install the scheduled importer (ADR-019) with a dead-man monitor.
   - Optionally subscribe to Leasehackr category emails.
3. [ ] **Inventory plan.** Choose a paid MarketCheck tier (radius over 100 miles, no monthly quota
   gaps), or rely on Auto.dev beyond 100 miles.
4. [ ] **More lease programs** from licensed or written-permission sources only.
5. [ ] **The enthusiast lane.** Retire the manual-transmission photo check, or restore it once the
   vision provider account is verified.

## Sprint 4: hardening

1. [ ] Split `catcht/src/lib/dal.ts` by domain (auth, queue, reports, ingest).
2. [ ] Fail the scheduled workflow when every source fails, and retry transient NHTSA errors.
3. [ ] Docs truth pass: README, standalone runbook, deployment checklist, STATUS.

## Owner decisions

| Decision | Needed for |
|---|---|
| Turn on "Confirm email" in Supabase Auth, after checking the confirmation template | Sprint 1 item 1 (defense in depth) |
| Paid MarketCheck tier or not | Sprint 3 item 3 |
| Lease caps, and whether near-misses should appear | Sprint 3 item 1 |
| Retire or restore the enthusiast lane | Sprint 3 item 5 |
| Install the lease-notification importer | Sprint 3 item 2 |

## Progress log

- 2026-10-10: Plan written from the audit. Sprint 1 started with item 1.
