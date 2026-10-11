---
title: A recipient's report cadence counts Eastern calendar days, however long it is
status: accepted
date: 2026-10-10
amends: ADR-018 decision 3
---

# ADR-021: Report cadence counts calendar days

## Context

`user_profiles.digest_cadence_hours` sets how often a recipient may get a report. ADR-018 made daily
recipients (23 hours) count Eastern calendar dates instead of elapsed hours, because the scheduled
workflow starts hours late by a varying amount. From 2026-09-19 to 2026-10-10 its report runs
started between 09:55 and 15:24 Eastern. Longer cadences kept the elapsed-hours check, which no
recipient used.

On 2026-10-10 the owner asked for both report recipients to get one report every three days. Under
the hours check, a third-day run that starts earlier in the day than the last report has had fewer
than 72 hours, and that report slips to the fourth day. With start times spread like those above,
about half of all cycles would slip.

## Decision

1. A cadence is a whole number of Eastern calendar days, `round(hours / 24)` and at least one: 23 or
   24 hours is daily, 72 hours is every third day, 168 hours is weekly.
2. A recipient on a cadence longer than one day is due once that many calendar days have passed
   since the Eastern date of their last delivered report. Daily recipients keep ADR-018's rule of
   one report per Eastern date, enforced by the unique run key.
3. Quiet days work as before. A due recipient with nothing new gets no email, and a check-in follows
   seven days without one. When the due day is quiet, the next report goes out on the first later
   day with something new.
4. Report copy stops promising a daily schedule. The email header reads "Your shortlist" and the
   archive is titled "Reports".
5. Cadence stays a per-profile value the operator sets in SQL. The app has no control for it yet.
   (Amended 2026-10-11 by PR #28: each person chooses Daily, Every 3 days, Weekly, or Paused on
   the Reports page. Operators can still set other values from 12 to 720 hours.)

## Consequences

- A three-day recipient gets at most one report every three days, and the report never slips a day
  because the workflow started earlier than last time.
- Each report still carries the top 12 eligible candidates by deal score, now drawn from up to three
  days of collection.
- Collection is unchanged. Each source keeps its own cadence (ADR-018).
- `digestIsDue` and its elapsed-hours arithmetic are removed.
- Changing a recipient's cadence means updating `digest_cadence_hours` (12 to 720) until the app
  offers a setting.
