---
title: Car Hunt uses a unified offer model and policy-aware source adapters
status: superseded
date: 2026-07-14
supersedes: ADR-005 used-inventory product boundary
superseded-by: ADR-012
---

# ADR-007: Car Hunt is a reusable vehicle-offer platform

## Context

The original Catcht release proved one narrow workflow: search AutoTempest for used manual cars,
open supported listing pages, verify the shifter in source photos, rank the cars, and send one
private predecessor digest. That model does not generalize cleanly to new inventory or leases. A
purchase listing is a single vehicle with a price and odometer; a lease post may describe one or
many vehicles using payment, drive-off, term, annual mileage, incentives, fees, region, and expiry.

Source access is also not interchangeable. Some providers offer licensed inventory APIs or dealer
feeds, Discourse exposes public RSS, marketplaces offer user-created alerts, and some marketplace
terms prohibit automated extraction. Treating every source as a Camoufox scraper would make the
product brittle, difficult to operate legally, and impossible to describe honestly.

## Decision

Rename the reusable product **Car Hunt** while retaining **Mookmobile** as one configured private
deployment. Normalize all discoveries into an offer contract with three kinds:

- `used` and `new` purchase offers keep vehicle price, mileage, VIN, location, photos, transmission,
  market comparison, and optional manual-photo evidence;
- `lease` offers keep monthly payment, due at signing, term, annual miles, fees, MSRP, discount,
  money factor, residual, region, expiry, parse confidence, and a calculated effective monthly cost;
- incomplete forum posts remain explicit deal leads with lower confidence rather than invented
  numbers, but only after the post itself supplies make, model/alias, and region evidence.

Saved searches describe user intent independently of sources. A search selects offer kinds,
make/model/trim, geography, transmission, purchase limits, and lease limits. Source adapters declare
their supported offer kinds, transport, attribution, authorization requirement, pacing, and health.
Every run records success, empty, unavailable, challenged, or failed status with counts and a
non-secret diagnostic.

Use licensed MarketCheck inventory as the primary optional new/used API adapter. Use Leasehackr's
public Discourse category RSS as an opt-in personal-use deal-lead adapter that stores attribution,
small normalized facts, and the original link rather than republishing forum content. Support
marketplace saved-search/email imports and operator-provided dealer feeds as durable extension
points. Keep the existing AutoTempest/direct-browser implementation behind an explicitly named
legacy adapter during migration; it is not the reusable default and must not be represented as
authorized coverage. Never solve CAPTCHAs, bypass challenges, or retry 403s aggressively.

Keep the existing `catcht.listings` table name as an internal compatibility detail while expanding
it into the offer store. This avoids a risky table/FK cutover in the live deployment. Application
types, routes, and copy use “offer,” and a later maintenance migration may rename internal objects.

## Consequences

- One dashboard and digest can compare used cars, new inventory, and lease opportunities without
  pretending their economics are identical.
- Mookmobile's current used/manual records and one-time action links remain valid through migration.
- A fresh installation works with any subset of adapters and reports missing credentials or source
  permission as unavailable coverage instead of silently returning zero cars.
- MarketCheck adds a metered external dependency for broad inventory; operators can substitute an
  authorized provider through the same adapter contract.
- Leasehackr posts are leads whose terms still require confirmation with the poster or dealer.
- The legacy browser collector can be removed after Mookmobile has an authorized replacement for
  its inventory and photo inputs.
