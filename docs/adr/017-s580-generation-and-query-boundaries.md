---
title: S580 searches keep generation and provider result boundaries explicit
status: accepted
date: 2026-09-08
extends: ADR-016
---

# ADR-017: S580 generation and query boundaries

The owner raised the S-Class asking-price cap to $40,000 and requested S580 coverage through
2025. S560/S450 retain their 2018–2020 range. The S580 starts in model year 2021, so its preset
uses 2021–2025, with the existing 120,000-mile discovery ceiling and the owner's location/radius.
This supersedes ADR-016's $25,000 preset ceiling, without changing existing lower target prices.

Body-restricted inventory groups also include their exact requested year bounds. W222 and W223
therefore receive separate bounded queries, while S560 and S450 still share one. Without this,
MarketCheck's ascending-price result cap can fill with older cars before any S580 is considered.
This adds one group per provider for this owner's expansion. The existing total group ceilings,
per-request result limits and shared detail budget still apply; capped coverage stays explicit.
Unrestricted searches retain the existing make/type/ZIP grouping to avoid a fleet-wide fan-out.

S580 uses an unrestricted fuel-category query because feeds describe its mild-hybrid V8 as either
gasoline or hybrid. Exact S 580/S580 trim aliases, sedan body and year bounds remain mandatory;
S580e does not match. The queue lane remains gas/hybrid. No W222-only package or factory-standard
rule is applied to the W223. Existing feature keys support evidence for rear steering, assistance,
seats and cameras; the guide calls for a build sheet and generation-appropriate inspection.
Single-search MarketCheck requests include explicit trim aliases as its documented comma-separated
filter, covering S 580/S580 with and without the 4MATIC suffix before local validation.

References: [Mercedes 2021 S-Class introduction](https://www.mercedes-benz.ca/en/future-vehicles/2021-s-class-sedan)
and [US dealer 2021 launch notice](https://www.mbofhenderson.com/mercedes-benz/s-class/2021-sedan/release-date-and-price-info/).
Production saved-search edits are owner-scoped runtime configuration, not a schema migration or
automatic seed for other users.
