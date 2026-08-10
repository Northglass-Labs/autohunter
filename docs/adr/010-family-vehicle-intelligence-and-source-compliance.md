---
title: Family vehicle recommendations use evidence-backed features and authorized sources
status: superseded
date: 2026-08-09
supersedes: ADR-007 Leasehackr RSS collection decision
superseded-by: ADR-012
---

# ADR-010: Family vehicle intelligence and compliant collection

## Context

The predecessor must support a shared family-car search in addition to the original inexpensive
manual-car watches. A useful recommendation is not just a make, model, price, and mileage. Invited
drivers need to compare electric, gas, hybrid, and lease options by family practicality, driver-assistance
capability, driving character, equipment, and value. The same feature name can also mean materially
different things by manufacturer, model year, trim, and package. For example, hands-free highway
driving, hands-on lane centering, low-speed traffic-jam assistance, and adaptive cruise control are
not interchangeable.

The current MarketCheck free plan permits 500 calls per month and caps inventory searches at a
100-mile radius. Issuing one API call per saved search does not scale to a broad family-car catalog.
MarketCheck inventory results are suitable for discovery, but exact options and equipment may
require a metered listing-detail or VIN-specification request.

ADR-007 allowed a scheduled Leasehackr Discourse RSS adapter. Leasehackr's current terms prohibit
automated crawling or scraping of its pages and data. A publicly reachable feed is therefore not
sufficient authorization for the production collector to fetch it automatically.

## Decision

### Search and collection

- Keep MarketCheck as the primary licensed used/new inventory source. Group compatible saved
  searches by provider, location, offer kind, and make, then query comma-separated model sets. When
  a make has both automatic and manual targets, omit the provider-side transmission filter for that
  shared query. Reapply every saved search's exact model, year, price, mileage, transmission, and
  geography constraints after normalization before persisting a candidate.
- Budget the free MarketCheck tier explicitly. The default production plan permits at most thirteen
  inventory calls and three listing-detail enrichments per daily cycle. A budget exhaustion is a
  visible partial-coverage state, never a silent empty result.
- Enrich only the highest-priority new candidates. Base inventory collection must still succeed when
  the detail endpoint is unavailable or the configured plan does not include it.
- Retire scheduled Leasehackr RSS retrieval. Preserve the parser only for manually supplied exports
  and fixtures; it must not make a production network request. Ingest lease leads from
  user-authorized Gmail alerts, dealer feeds, operator uploads, or a separately licensed provider.
- Keep direct marketplace browser scraping disabled when provider terms or robots rules prohibit it.
  Do not use Camoufox to bypass access controls, CAPTCHAs, or source policy.
- Add an optional Auto.dev adapter only after an operator supplies an account and API key and accepts
  its terms. A missing optional credential reports unavailable coverage and does not block the
  MarketCheck path.

### Vehicle and feature intelligence

- Split the shared review queue into `ev`, `gas`, `lease`, `enthusiast`, and `other` lanes. `gas`
  includes conventional, hybrid, and plug-in-hybrid family vehicles; powertrain remains a separate
  normalized field so the UI can distinguish them.
- Store family-search intent independently of provider syntax: model-year range, target and hard
  prices, powertrain, desired and required feature keys, aliases, rationale, and priority.
- Normalize equipment into stable feature keys such as `hands_free_highway`,
  `adaptive_cruise_lane_centering`, `rear_axle_steering`, `air_suspension`, `third_row`,
  `surround_view`, and `tow_package`.
- Every feature claim has `confirmed`, `expected`, or `unknown` status and a source. Provider listing
  options can confirm equipment. Exact model-year/trim/package rules can mark equipment expected.
  A trim name alone never upgrades an uncertain claim to confirmed. The dashboard tells the user to
  verify expected equipment against the window sticker or VIN build sheet.
- Preserve source URLs and public listing photos. Store only bounded normalized facts and short
  evidence snippets needed to explain a recommendation; do not mirror provider pages or raw
  payloads.

### Ranking and review workflow

- Rank family vehicles using hard eligibility first, then transparent deal, family-fit, and feature
  scores. Missing enrichment lowers confidence but does not invent a negative fact.
- Keep Interested and Pass as durable shared decisions correlated by canonical VIN. Add a neutral
  `Back to review` action so either decision can be reversed without deleting history.
- Prefer meaningful price drops and newly confirmed desired equipment when deciding whether a
  previously seen vehicle should resurface. Retain the existing digest cooldown and suppression
  boundaries.

## Consequences

- The daily collector can cover a broad target catalog without exceeding the current free API quota,
  while explicitly disclosing the present 100-mile radius limitation.
- Recommendations explain why a vehicle fits and which equipment still needs verification instead
  of presenting trim-derived guesses as facts.
- Lease coverage temporarily depends on configured email alerts or authorized feeds rather than
  Leasehackr crawling. This is less broad than scraping, but it is durable and respects source terms.
- Additional licensed sources can improve radius, options, or lease coverage behind the same
  adapter and evidence contracts without changing the review experience.
- Mookmobile's existing manual-car searches remain valid in the `enthusiast` lane through an additive
  migration.
