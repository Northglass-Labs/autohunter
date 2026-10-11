---
title: A used car's value is measured against comparable listings AutoHunter has collected
status: accepted
date: 2026-10-10
amends: ADR-010 (ranking and review workflow)
---

# ADR-023: Market value from comparable listings

## Context

ADR-010 ranks purchase offers by hard eligibility, then by transparent deal, family-fit and feature
scores. The deal score's value part was designed around a market estimate, but no adapter supplies
one: every listing's `market_estimate` was empty.

Without it, the score fell back to `(msrp − price) / msrp`. For used cars, provider MSRP is often not
the original sticker: several 2019 S560s carried an "MSRP" of $32,000 to $40,000.

The 2026-10-10 audit found that:
- price changed the score for only 72 of 537 eligible matches;
- higher prices correlated with higher scores;
- one provider held 43 of the top 50 picks;
- placeholder prices from $190 up were eligible.

AutoHunter already holds the evidence a market value needs. It saw about 2,100 used listings in 90
days, and most of the household's models have 30 to 390 listings each.

## Decision

1. **Comparables.** At ingest, a used listing's estimate comes from other used listings seen within
   90 days with the same make and model, within one model year. They are narrowed in this order:
   - **Same trim** when at least five exist. Trims are compared after removing case, spacing,
     drivetrain and body words, and anything a dealer appended after "w/".
   - **Trim family** when at least five exist: one trim key contains the other.
   - **The whole model** when at least eight exist.

   Otherwise the listing has no estimate.
2. **Estimate.**
   - Comparable prices below 45% or above 220% of their median are excluded.
   - Each remaining price is adjusted to the target's model year, at 8% a year.
   - Each is also adjusted to the target's mileage. The rate is fitted from the comparables when at
     least 12 of them have a mileage standard deviation of 5,000 miles or more. It is held to 0.1–1.5%
     per 1,000 miles, and defaults to 0.5%.
   - The estimate is the median, rounded to $50. The comparable count, the basis and the spread are
     stored with it.
3. **Implausible prices.** A used listing priced below $1,000, or below 45% of its estimate, is
   ineligible as `price_suspect`. Such prices are data errors, such as a down payment or monthly
   payment in the price field.
4. **Used-car score.**
   - Value: 25 points at market, plus or minus 2 points per percent below or above, from 0 to 50. A
     listing without an estimate gets 20.
   - Mileage: up to 15. Distance: up to 10, reaching zero at 250 miles.
   - Feature and family-fit additions are unchanged.
   - Provider MSRP no longer scores used cars; new-car offers keep it.
5. **Display.** Cards and reports state the estimate, how far the price is below or above it, and
   the number of comparables. A price 20% or more below is flagged as unusual, with a prompt to
   check the title and history.

## Consequences

- **Coverage.** Simulated on production data on 2026-10-10:
  - 534 of the owner's 537 eligible matches get an estimate, 525 of them from same-trim comparables.
  - The new top picks are priced 8–25% below comparable cars.
- **Source balance.** Feature and family-fit scores no longer depend on the source. MarketCheck
  still leads because its plan caps results at 100 miles, while Auto.dev's matches sit at a median
  107 miles and score less for distance.
- **The estimate is relative.** Providers are queried with each search's price and mileage caps, so
  comparables for a capped search lean toward cheaper cars. Ranking within a search is still fair,
  and the estimate stays a fair measure across searches with similar caps.
- **Scores are refreshed at ingest.** A collection run re-scores every listing it sees. The
  production rollout touches each search's `updated_at` (ADR-020), so queues show only matches
  scored under this ADR.
- **Placeholder prices disappear** from queues and reports. A future provider that supplies a real
  valuation can feed the same field and display.
