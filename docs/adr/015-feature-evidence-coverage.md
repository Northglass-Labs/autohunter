---
title: Feature evidence gains a summary tier, a required-feature gate, and upgrade-targeted enrichment
status: accepted
date: 2026-08-15
extends: ADR-010 evidence model and ADR-012 source architecture
---

# ADR-015: Feature-evidence coverage

## Context

Equipment evidence previously came from only two inputs: the metered MarketCheck listing-detail
call (three per daily cycle by default) and exact model-year rules. With roughly 165 accepted
listings per cycle, nearly every listing carried `unknown` for each desired feature even when the
provider's own search response — dealer headings such as "w/ Driving Assistance Professional" —
named the exact package. Several search-response fields (`std_seating`, `carfax_1_owner`,
`carfax_clean_title`, root-level colors, `dom`) were silently dropped by camelCase-only fallbacks.
`required_features` was stored, validated, and rendered but never enforced anywhere, and the detail
budget was spent cheapest-first regardless of whether a fetch could change any evidence.

## Decision

1. **Summary evidence tier.** Feature patterns now also run over provider search-response text
   (headings, summary option arrays, Auto.dev retail descriptions) as the new evidence source
   `provider_summary`. Summary matches can only produce `expected` status. `confirmed` remains
   reserved for listing-detail/window-sticker-grade evidence, and the ingest contract now rejects
   any `confirmed` evidence whose source is not `provider_listing`. Evidence strings quote the
   matched summary text so the tier is visible wherever evidence is shown.
2. **Precedence.** Detail evidence (`confirmed`) beats summary text (`expected`,
   `provider_summary`), which beats model rules (`expected`, `model_rule`); everything else stays
   `unknown` with the existing verification caveat. Listing-specific text outranks model-level
   inference at the same status.
3. **Declarative expected-equipment rules.** The model-year rule ladder is now an exported
   declarative table (`EXPECTED_EQUIPMENT_RULES`) covering the purchase catalog and the lease
   targets. Entries must describe factory-standard fitment only; optional packages never enter the
   table. New coverage: the three-row lease family (Lexus TX, Grand Highlander, CX-90, Telluride,
   Palisade, Aviator), SQ7 third row and air suspension, GV80 Highway Driving Assist, XC90 Pilot
   Assist, MDX Type S air suspension, TX 500h Dynamic Rear Steering, and 2021+ GLS surround view.
4. **ADAS pattern coverage.** BlueCruise and ProPILOT Assist 2.x join the hands-free set —
   evidence-gated exactly like Super Cruise. ProPILOT Assist (bare), Travel Assist, InnoDrive, and
   Active Driving Assistant Pro join the hands-on lane-centering set. BMW option codes 2VH/ZDH
   (Integral Active Steering / Dynamic Handling Package) and ZDY/5AU (Driving Assistance
   Professional / Active Driving Assistant Pro) decode per the G05 ordering guide.
5. **Required features gate eligibility.** An active offer whose search lists `required_features`
   is ineligible with the visible reason `required_feature_missing` unless every required key has
   `confirmed` or `expected` evidence. Benchmarks and market signals stay visible as negotiation
   context and are not gated.
6. **Upgrade-targeted enrichment.** The MarketCheck detail budget is spent by upgrade value —
   summary-`expected` features (which a detail fetch can confirm) weigh 2, `unknown` features
   weigh 1, already-`confirmed` features weigh 0 — before search priority and price.

## Consequences

- Every accepted listing now carries evidence from its own summary text on the first pass, so the
  queue and reports can distinguish "the dealer names this package" from "nothing is known", without
  weakening what `confirmed` means.
- The contract-level rule that `confirmed` requires `provider_listing` protects the product-truth
  invariant against any future adapter drift.
- `required_features` now has real semantics; the saved-search form states them. Existing searches
  all have empty `required_features`, so no stored search changes behavior until an owner opts in.
- The rule table is data: adding a nameplate is one reviewed entry plus a test iteration, and rules
  remain auditable in one place.
- No database migration is required: the evidence jsonb shape is unchanged and the new source value
  passes the existing shape check; enforcement lives in the ingest contract and collector.

## Addendum (2026-08-15, same day): persistence, budget, and targeting

Field observation from the first production cycle on this ADR's code: almost every listing still
showed `unknown` equipment. Three compounding causes were fixed the same day:

1. **Evidence persistence.** The ingest upsert overwrote `feature_evidence` wholesale, so a
   listing enriched yesterday reverted to `unknown` today when the detail budget did not reach it
   again. Ingest now merges per feature key — the higher-ranked persisted evidence survives unless
   the incoming inference is itself `enriched`, which replaces the persisted state entirely
   (`catcht/src/lib/feature-intelligence.ts`). Feature-match and family-fit scores are recomputed
   from the merged evidence on the same scale the collector uses.
2. **Budget respend.** The collector re-fetched the same cheapest listings every cycle. The collector
   config now carries `enrichedListingIds` (opaque provider listing IDs whose detail evidence is
   already persisted), and the MarketCheck adapter skips them, so the budget always lands on
   listings that still need evidence.
3. **Budget size.** `platform.example.json` (the production config) raises `detailFetchLimit`
   from 3 to 20 — the clamp ceiling the adapter has always enforced. With persistence and
   skip-targeting, the whole active queue reaches detail-grade evidence within days and the daily
   spend then covers only newly discovered listings.
