---
title: Correlate exact VINs and keep photo verification optional and keyless on Vercel
status: accepted
date: 2026-07-16
---

# ADR-009: Correlate exact VINs and keep photo verification optional and keyless on Vercel

## Context

The same physical vehicle can appear through a marketplace feed, a licensed inventory provider,
and a dealer page. Car Hunt historically gave each source its own durable identity so price history,
links, and attribution survived independently. That is the right storage model, but it can produce
duplicate cards, repeated email recommendations, and a Photo-pending copy beside a verified copy.

Manual verification also needs more than the primary photo. Interior evidence is commonly near the
end of a 15-to-30-photo gallery. Limiting verification to the first ten photos left obvious shifters
unreviewed. A permanent AI key would add another production secret even though Vercel can issue a
short-lived workload identity to deployments.

## Decision

- Preserve one stored row per source identity. Do not merge or delete marketplace records.
- Correlate only exact normalized 17-character VINs. Rows with missing or invalid VINs remain
  source-scoped; fuzzy title, price, seller, or photo matching cannot collapse vehicles.
- At read and digest time, choose one canonical row per exact VIN. Prefer a remembered decision,
  then a current listing, then verified/eligible/photo-backed inventory, deal score, and freshness.
- Reuse persisted manual-photo evidence across an exact VIN. New source rows can become verified
  from already reviewed photos without another model call, while retaining their own URL and raw
  payload.
- Keep collection durable when the optional verifier is unavailable. Ingest persists candidates
  and reuses existing proof without making a billable model call; the scheduled digest phase owns
  new verification attempts and records an allowlisted health reason without failing collection or
  email processing.
- Verify at most five pending vehicles per scheduled cycle. For each, review only unseen HTTPS
  images, up to 20 per listing in sequential batches of ten, and stop after clear conventional
  manual-lever evidence.
- Make the verifier opt-in. A Vercel deployment uses AI Gateway with the short-lived OIDC identity
  on each Function request (`x-vercel-oidc-token`, with the environment form retained for
  build/local use); another host may use a direct server-only OpenAI key. No provider leaves the
  listing Photo pending and records an explicit unavailable source-health state.
- Treat vision failure as visible, bounded source health. Never invent proof, infer a transmission
  from trim, expose raw model/provider output in logs or the dashboard, or let an account/billing
  error roll back successfully collected listings.

## Tradeoffs

Exact VIN correlation intentionally misses duplicate ads whose VIN is absent or malformed. That is
safer than hiding two distinct cars through fuzzy matching. Retaining source rows uses more storage
than a destructive merge, but preserves provenance and makes a bad provider record reversible.

Twenty high-detail images cost more than ten. Sequential batches and early stopping bound that cost,
and the five-car cycle limit prevents an old backlog from creating an unbounded request burst.
OIDC removes a long-lived AI credential from Vercel but still uses billable AI Gateway/model usage
under the deployment owner's account.

## Consequences

- A driver sees and receives one recommendation per exact VIN even when multiple providers carry it.
- Interested and Ignored decisions continue to suppress rediscovered exact-VIN copies.
- An obvious interior photo later in a gallery can clear Photo pending automatically.
- Every underlying source link, source health record, raw payload, and price observation remains
  available for diagnosis.
- Standalone installations work without Vercel, Hermes, Camoufox, or an AI provider; only automatic
  photo verification is unavailable when no verifier is configured.
