---
title: OEM lease programs are queried by metro area, metered providers are paced, and quiet days send no report
status: accepted
date: 2026-10-09
amends: ADR-014 (decision 3) and ADR-016 (source freshness)
---

# ADR-018: Lease feed queries, provider pacing and quiet-day reports

## Context

The household's lease-only recipient received 53 reports from 2026-08-10 to 2026-10-09, and 52
of them said "no new matches". Production records show four causes:

1. The OEM incentive adapter used MarketCheck's generic incentive search with a `zip` parameter.
   That parameter matches only programs recorded at that exact ZIP code, so all 70 production runs
   returned no programs. Source health showed the result as a healthy empty run.
2. The authorized lease-alert importer has not run since 2026-08-10. Its last result stayed in
   every report as "stale", beside inventory providers that do not serve lease searches.
3. Report eligibility required 23 hours since the previous report. The scheduled workflow starts
   four to nine hours late by a varying amount, so a run that started earlier in the day than the
   previous one was skipped: 3 of 16 days from 2026-09-24 to 2026-10-09, for every recipient.
4. Daily inventory collection makes about 330 MarketCheck search calls a month at current search
   counts, and the monthly allowance ran out on 2026-08-17 and 2026-09-18.

## Decision

1. OEM lease programs are queried through `GET /v2/search/car/incentive/{make}/{zip}`, which
   resolves the ZIP to its metropolitan statistical area, where OEM programs are published. Models,
   offer type, monthly and due-at-signing ceilings, sort order and row limit remain query parameters.
2. Metered sources declare a stateless cadence computed from the UTC date, so the collector needs
   no state between runs. MarketCheck inventory runs every second day, with at most four detail
   calls per run. OEM programs run every Monday and on the 1st and 2nd of each month. A manual
   workflow input, `ignore_cadence`, queries every enabled source for verification.
3. Daily recipients receive at most one report per Eastern calendar date, enforced by the existing
   unique run key. The elapsed-hours check applies only to cadences longer than 24 hours.
4. A day with no new or meaningfully changed candidates sends no email and records no run. After
   seven calendar days without a delivered report, a weekly check-in is sent instead. It names the
   date of the last report.
5. Each report lists only the sources serving the recipient's active offer kinds. Freshness is
   judged per source: 72 hours for MarketCheck inventory, nine days for OEM programs, 48 hours
   otherwise. A source that searched, found nothing, and has returned no provider results for
   seven days is shown as "No provider results" and needs attention, not as healthy. The retired
   automated Leasehackr feed is not listed. Dashboard members see the same filtered list; admins
   see every listed source.

## Consequences

- A recipient with nothing new receives about four check-ins a month instead of about thirty
  identical emails. Every email now contains new information or a weekly status.
- A dead or silent feed shows as needing attention within one collection interval.
- Quiet days no longer appear in report history. Source runs remain the record that collection
  happened.
- MarketCheck inventory search calls fall to about 165 a month at current search counts. OEM program
  queries add about six runs a month, one call per make-and-ZIP group.
- Lease reports keep showing the email importer as stale until its host schedule is restored.
  ADR-014 decision 4 still governs how the importer may run.
