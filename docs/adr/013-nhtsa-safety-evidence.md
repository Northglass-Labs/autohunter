---
title: AutoHunter adds bounded first-party NHTSA safety evidence without bulk VIN lookup
status: accepted
date: 2026-08-10
---

# ADR-013: Bounded NHTSA safety evidence

## Context

Family suitability requires more than seating and driver-assistance packages. NHTSA publishes
official model-year recall campaigns and 5-Star Safety Ratings, but its API is rate controlled and
explicitly not intended for bulk VIN lookup. A model-year campaign also does not prove that a
particular VIN has an unrepaired recall.

## Decision

- Enrich purchase inventory by unique model year, make, and model through the documented NHTSA
  recall and Safety Ratings endpoints.
- Bound model groups, rating variants, request timeouts, and pacing per collector cycle. Share one
  result across duplicate source listings and user matches for the same model group.
- Aggregate crash ratings conservatively by retaining the lowest valid score among the bounded
  tested variants. Preserve how many variants were available and actually inspected.
- Store only campaign number, component, and received date for a bounded set of model-year recalls.
  Do not persist source narratives, remedies, raw responses, or complaint data.
- Label model-year campaigns as context. Link each listing's VIN to the official NHTSA recall check
  and tell the user that only that lookup can establish open status for the specific vehicle.
- Do not call a VIN-decoder or VIN-recall API in bulk. A missing NCAP result means `not_rated`, not
  unsafe. NHTSA failure or query caps remain visible in source health and never drop inventory.
- Surface safety evidence in web and email reports but do not silently alter deal score. Campaign
  counts and test coverage are not comparable enough to be a responsible automatic penalty.

## Consequences

- AutoHunter provides first-party crash and recall context while respecting the agency's usage
  boundary.
- Some trims or drivetrains may differ from the conservatively aggregated variants; the UI discloses
  this instead of claiming trim-specific precision.
- A user must still perform the official VIN lookup and a pre-purchase inspection before relying on
  recall status.
