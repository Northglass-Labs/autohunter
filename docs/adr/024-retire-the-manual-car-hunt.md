---
title: Retire the manual-car hunt and its photo check
status: accepted
date: 2026-10-11
supersedes: ADR-009 (photo verification only)
---

# ADR-024: Retire the manual-car hunt and its photo check

## Context

AutoHunter began as a manual-transmission watchlist: MX-5 Miata, BRZ, FR-S, Civic Si, 944 and
944 Turbo. Before a listing could be recommended, a vision model had to see a manual shifter in its
photos. By October 2026:

- the six manual-car searches had been paused since 2026-08-15;
- the photo check failed 42 times on an unverified vision-provider account, then went idle;
- the invited member the hunt was kept for had never signed in and had no searches or reports;
- the report job still loaded up to 2,000 listings on every run to look for photo work.

The owner chose to retire the hunt rather than verify a vision-provider account (overhaul Sprint 3
item 5).

## Decision

1. Delete the hunt's production data:
   - the six manual-car searches, their 15 listings and 12 matches;
   - nine photo-check results and the six-row legacy watch list;
   - four July–August reports that contained only those cars;
   - the unused member invite.

   An export kept privately by the owner, taken before the delete, is the only copy.
2. Remove the photo check: the vision client, the verification runner, its pass in the report job,
   and the `VISION_PROVIDER`, `OPENAI_API_KEY` and `OPENAI_VISION_MODEL` settings.
3. Remove the manual-car surfaces:
   - the Photo pending view;
   - the Enthusiast lane and search profile;
   - the Manual transmission option;
   - manual badges on cards and in report emails, and the manual-only email subject.
4. New and edited searches accept transmission `any` or `automatic` only. The app, ingest API and
   collector reject the `enthusiast` lane and profile.
5. Leave the deeper plumbing in place but unused:
   - the ranking's manual-photo branch and the `manualEvidence` ingest field;
   - the `manual_evidence` and `watch_models` tables and the manual columns;
   - the disabled AutoTempest/Camoufox path.

   Removing them changes the collector-to-app contract and the schema. That work is scheduled with
   the Sprint 4 data-layer split.

## Consequences

- No one can create a manual-transmission search. Restoring one means reversing this ADR and
  approving a vision provider again. The export holds the old search definitions.
- Automatic searches still reject listings that claim a manual transmission.
- Report emails no longer say "Manual verified", show photo confidence, or announce "manual" finds.
- The report job no longer scans listings for photo work before sending.
- ADR-009's VIN correlation stands. Its photo-verification decisions are superseded.
