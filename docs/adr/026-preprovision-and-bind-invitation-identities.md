---
title: Preprovision and bind invitation identities before sign-in
status: accepted
date: 2026-11-03
supersedes: ADR-022 invitation claiming and public signup boundary
---

# ADR-026: Preprovision and bind invitation identities before sign-in

## Context

The earlier invite flow reserved only an email address in `catcht.user_profiles`.
Supabase Auth then allowed public user creation when that email appeared on the
allowlist, and the first email-link session claimed the profile. A caller who
guessed an unclaimed invitation could therefore create the Auth identity first
with an attacker-chosen password. Password AMR did not grant application data,
but both parties shared one Auth identity and ordinary global sign-out let the
attacker disrupt the recipient's refresh sessions.

Email confirmation alone does not remove the attacker-chosen credential. An
email allowlist hook also reveals too much authority: knowing the address must
never be sufficient to create its identity.

## Decision

1. Creating an invitation reserves a profile first, then uses a server-only
   Supabase secret key to create an email-only Auth user whose UUID is the
   profile UUID. The profile is bound only to that exact UUID and normalized
   email.
2. The before-user-created hook accepts only an active profile's reserved UUID
   and exact email. Public signup cannot choose the Auth UUID. Global public
   user creation is disabled, while the email provider remains enabled for
   existing preprovisioned identities. Login still calls `signInWithOtp` with
   `shouldCreateUser: false`. Hosted readback of that split remains a promotion
   gate.
3. Retries may adopt only the same deterministic UUID with the same normalized
   email. An email owned by another Auth UUID is a hard conflict. A failed or
   ambiguous bind is followed by an exact profile readback. The identity is not
   deleted after a bind attempt because the database may have committed before
   returning an error, or a concurrent retry may have completed the bind.
4. Login always uses `signInWithOtp` with `shouldCreateUser: false`. Every valid
   address receives the same browser response, and the application never
   queries membership before requesting the link.
5. A session resolves membership only by verified `claims.sub` to the bound
   `auth_user_id`. Email-based claiming is removed. The existing email-link AMR
   restriction remains defense in depth.
6. Ordinary sign-out is local to the current session. Account-wide refresh-token
   revocation requires a separate administrative operation.

## Consequences

- Guessing an invited email cannot create or capture its Auth identity.
- Invited users can receive magic links immediately because their email-only
  identities already exist; no password is provisioned.
- Existing bound identities keep their current UUIDs. Unbound production
  invitations must be audited and preprovisioned before promotion.
- Ambiguous pre-existing identities fail closed and require an explicitly
  reviewed recovery action; the app never binds them by email.
- A deterministic identity left unbound after a confirmed bind failure is
  retained for a safe retry or reviewed recovery. This avoids deleting an
  identity that an ambiguous or concurrent bind already owns.
- The server-only Supabase secret becomes a required deployment secret and must
  never enter browser code, logs, or committed configuration.
