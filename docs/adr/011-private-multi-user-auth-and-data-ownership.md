---
title: AutoHunter uses invite-only Supabase Auth with normalized per-user ownership
status: accepted
date: 2026-08-10
---

# ADR-011: Private multi-user auth and data ownership

## Context

The predecessor installation is moving from a single-recipient session to private AutoHunter at
`autohunter.northglass.io`. Invited drivers need separate magic-link sessions, saved searches, review
queues, and email digests. A listing may match both people at the same time, but one person's
Interested or Pass decision must never change the other person's queue.

The current schema cannot provide that isolation. Saved searches have no owner, each listing stores
only one `search_id`, and disposition and digest suppression are global listing fields. The web app
uses a custom HMAC login link for one configured recipient. The private `catcht` schema is otherwise
a useful security boundary: browsers cannot query it through the Supabase Data API, and all data
access already passes through server-only code.

## Decision

### Authentication and membership

- Use Supabase Auth passwordless email links and `@supabase/ssr` cookie sessions. Validate the
  authenticated identity on the server for every protected page, route, and Server Action; Proxy is
  only responsible for refreshing cookies and is never the authorization boundary.
- Keep AutoHunter invite-only. A private `catcht.user_profiles` row is the membership allowlist and
  maps a normalized email address to an optional Supabase `auth.users` identifier. The first valid
  login claims an unclaimed profile with the same email. User metadata is never trusted for role or
  ownership decisions.
- Permit administrators to create inactive-auth member profiles from the dashboard. This reserves
  ownership and allows the invited person to request their own magic link without exposing a public
  signup path.
- Continue using server-to-server secrets for collection, ingestion, digest scheduling, and signed
  email actions. Those endpoints do not inherit browser sessions.

### Data ownership

- Keep vehicle listings and evidence global. The same VIN, dealer URL, and normalized vehicle facts
  should not be copied once per person.
- Add `owner_id` to saved searches. Replace the global search-name uniqueness rule with uniqueness
  per owner.
- Add `listing_matches` between listings and saved searches. Match-specific eligibility, ranking,
  lane, discovery timestamps, and resend suppression live on this relationship, so one listing can
  safely match several searches and owners.
- Add `user_listing_decisions` for Interested, Passed, and neutral state. Every read and mutation
  joins through a search owned by the current profile before returning or changing a listing.
- Scope digest runs to one user and one date. Digest recipients come from active profiles with an
  email address and digest delivery enabled.
- Migrate all existing searches, matches, decisions, and digest history to one legacy administrator
  profile before making ownership columns non-null. The production cutover assigns that profile's
  email before magic-link traffic is enabled.

### Security boundary

- Keep the `catcht` schema private from `public`, `anon`, `authenticated`, and `service_role`.
  Supabase Auth supplies identity only; the browser never receives database credentials or direct
  table access.
- Keep authorization predicates in the server-only data layer and cover cross-user reads and writes
  with database integration tests and browser E2E tests. A UI-hidden record is not considered
  protected unless the underlying mutation also rejects it.
- Accept only same-origin relative post-login paths, return the same login response for unknown and
  invited addresses, and use the hosted Auth redirect allowlist to prevent open redirects.

## Consequences

- Invited drivers can independently search, review, and receive reports while sharing one canonical
  inventory and evidence store.
- The collector remains efficient: it receives opaque active search definitions, not user email or
  session data, and one candidate can create more than one match without duplicating the listing.
- The application has more relational state than the single-recipient version, but ownership is
  explicit and testable instead of being inferred from deployment environment variables.
- Existing HMAC dashboard sessions are retired at cutover. Signed one-time email decision links
  remain supported, now scoped to a real profile identifier.
