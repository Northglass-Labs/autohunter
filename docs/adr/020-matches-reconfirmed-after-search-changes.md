---
title: Review queues and reports trust a match only after the collector re-confirms it under the search's current definition
status: accepted
date: 2026-10-10
---

# ADR-020: Matches are re-confirmed after a search changes

## Context

A match is judged once, when the collector ingests a listing for a search: `evaluateOffer` checks it
against the search as it stands at that moment and stores the verdict on `listing_matches`. The
review queue and the report candidate query read that stored verdict.

The app has no way to edit a search's criteria; it can add, pause, resume and reassign one. The
operator changes criteria with single-row SQL updates that set `updated_at`.

On 2026-10-09 the owner's SQ7 search was narrowed from any trim to Prestige. The collector stopped
returning Premium Plus cars for it, but the 40 Premium Plus matches judged under the old definition
kept their eligible verdict. A listing stays current until it expires: three days after an Auto.dev
sighting, or 14 days after the last sighting for providers without an expiry. One 2023 SQ7 Premium
Plus was in the owner's 2026-10-10 report.

Re-ingesting a listing also never refreshed its stored trim or title, although every run judges the
incoming ones. In production, 15 Auto.dev trims and 88 MarketCheck titles disagreed with their
latest payload. One 2024 SQ7 matched the Prestige search on Auto.dev's new "Prestige" label while its
card still read "4.0T Premium Plus". Of those MarketCheck titles, 46 were still the dealer headings
that PR #13 had cleaned only for new listings.

## Decision

1. The review queue, the photo-verification queue and the report candidate query trust a match
   only when `listing_matches.last_seen_at >= saved_searches.updated_at`, that is, when the
   collector re-confirmed it after the search last changed. The condition is applied before
   ranking, so a stale match cannot outrank a fresh one for the same listing.
2. Interested and ignored lists, and direct listing links, do not apply it. They hold decisions the
   owner already made.
3. Every ingest refreshes the listing's trim and title to the payload it just evaluated. Year, make
   and model stay as first recorded: production shows no year or model drift, and make differs only
   in letter case between runs.
4. Any change to a search's criteria sets `updated_at = now()`, as the app's own writes already do.

Considered and not adopted: a criteria-only timestamp kept by a trigger. It would spare pausing,
resuming and reassigning a search, but it needs a schema migration and a maintained list of
criteria columns. Re-ingest repairs the cost of the simpler rule within one collection.

## Consequences

- Narrowing a search takes effect in the queue and reports immediately. Matches that still qualify
  return as the collector re-confirms them.
- Pausing and resuming a search, or reassigning its owner, also moves `updated_at`. Its matches leave
  the review queue and reports until the next collection that covers it: daily for Auto.dev, every
  other day for MarketCheck inventory.
- A criteria edit made without updating `updated_at` is not detected; its stale matches age out on
  their own expiry, as before this decision.
- Cards and reports show the provider's latest trim and title. A provider that alternates labels
  makes the card follow it.
