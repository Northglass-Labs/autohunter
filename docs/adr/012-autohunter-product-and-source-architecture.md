---
title: AutoHunter is an invite-only Northglass vehicle intelligence product with evidence-first collection
status: accepted
date: 2026-08-10
supersedes: ADR-007 product naming and report delivery decisions
---

# ADR-012: AutoHunter product and source architecture

## Context

The current repository contains a working private vehicle-offer platform, production inventory,
family-vehicle feature intelligence, a licensed MarketCheck collector, a policy-disabled legacy browser
adapter, and an additive per-user ownership model. A separate Hermes cron previously browsed public
Leasehackr material and composed daily HTML emails. The first reports were useful, but later runs
lost source specificity and produced generic summaries. The cron was paused before this rebuild.

AutoHunter is a private Northglass product for a small invited group. It needs one
review queue for used purchases and leases, real listing media and source links, manufacturer- and
model-year-aware package evidence, reproducible economics, per-user preferences and dispositions,
branded reports, magic-link access, and honest coverage health. It must not evade access controls,
CAPTCHAs, published source restrictions, or licensing boundaries to create the appearance of broad
coverage.

## Decision

1. The public product name is **AutoHunter**. Product surfaces use the exact quiet endorsement
   **a Northglass Product**. AutoHunter receives a distinct child-product mark and accent system;
   the Northglass ensō is not repurposed as the AutoHunter logo.
2. The production origin is `https://autohunter.northglass.io`. Access remains invite-only through
   Supabase email magic links and database-backed profile invitations. Canonical vehicle rows remain
   global; searches, matches, decisions, reports, and delivery state remain profile-scoped.
3. Collection is adapter-based and provenance-preserving. Scheduled network adapters require a
   licensed API or express authorization. User-authorized mailbox alerts, user-supplied exports, and
   manual imports are valid inputs when their provenance and retrieval mode are recorded. A public
   URL alone is not authorization to crawl it.
4. Source health is a first-class result. Every run records coverage, freshness, query/radius caps,
   parsing confidence, and failure or policy reason. An unavailable or prohibited source is never
   reported as having no matching deals.
5. Deal economics are deterministic. Purchase price, mileage, distance, due at signing, fees, term,
   annual mileage, incentives, tax treatment, and effective monthly cost are normalized only from
   sourced values. Unknown values remain unknown and assumptions are explicit.
6. Package intelligence is manufacturer-, model-, trim-, market-, and model-year-aware. Expected
   equipment is not presented as listing-confirmed equipment. Highway-assistance capability,
   family practicality, driving character, and value scores retain explainable evidence.
7. AI is optional presentation support. It may summarize already-normalized facts and produce a
   bounded daily bottom line, but it may not invent fields, perform source retrieval, replace the
   deterministic calculator, or turn missing evidence into a recommendation.
8. Email and web reports share one typed report model. Reports contain active offers, new or changed
   evidence, benchmarks clearly separated from live offers, practical caveats, source-health notes,
   and direct source links. Delivery is idempotent and profile-scoped.
9. The internal `catcht` Postgres schema may remain during the rebrand to preserve compatibility and
   production history. Public package names, environment variables, UI, metadata, documentation,
   repository identity, and deployment identity migrate to AutoHunter, with temporary aliases only
   where a reversible production cutover requires them.
10. The paused Hermes lease watcher remains disabled until AutoHunter has passed a production report
    cycle. It will then be marked superseded; its historical outputs and state remain available as
    migration evidence rather than active automation.
11. The predecessor eight-row SQLite deal cache is retired from the repository. Its useful schema
    concepts—source URL, normalized monthly cost, due at signing, term, APR, and cash incentive—are
    retained as product requirements, while live state and report history are consolidated in the
    private Postgres store. Binary runtime databases must not be committed to the public product.

## Consequences

- AutoHunter can expand source coverage without coupling the product to a particular browser or
  inference provider.
- Coverage may be narrower than a technically possible scraper, but it is measurable, durable, and
  safe to operate as a public Northglass product.
- Leasehackr-derived reporting requires an authorized input path unless current source terms or a
  written permission change. The parser remains useful for mailbox alerts and operator-supplied
  exports even when scheduled page retrieval is unavailable.
- Rebranding does not require a risky rewrite of production table names or loss of historical
  listings, matches, decisions, or digest records.
- The old SQLite cache remains recoverable from the private predecessor history, but it is not a
  second source of truth and cannot drift alongside Postgres.
- The final repository can be public only after committed personal identifiers, secret-shaped test
  fixtures, legacy names, and obsolete operational instructions are removed or replaced.

## Open validation

- Confirm current terms and machine-readable access policy for every proposed source.
- Confirm a production-capable licensed inventory mix and its quota/cost envelope.
- Confirm the approved Northglass sender domain and hosted-auth SMTP path without exposing secrets.
- Verify the complete report and magic-link flows on desktop and mobile before retiring the legacy
  watcher or changing the production hostname.
