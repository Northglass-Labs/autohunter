---
title: The app trusts only sessions that an email link created
status: accepted
date: 2026-10-10
amends: ADR-011 (authentication and membership)
---

# ADR-022: Email-link sessions only

## Context

ADR-011 made AutoHunter invite-only:
- Supabase sends the email links.
- A private profile row is the allowlist.
- The first valid sign-in claims the unclaimed profile with the same email.

The hosted Auth project allows sign-up, which the before-user-created hook limits to invited
addresses, and it confirms new accounts automatically. Supabase's email provider also accepts
password sign-up, and it cannot be switched off apart from email links.

Together, these let anyone who knows an invited, unclaimed address register it with a password and
receive a confirmed session without access to that inbox. The app matched only the session's email,
so it would then claim that profile.

The 2026-10-10 audit found every member invitation unclaimed. No such sign-up has happened: the
production Auth store holds one user, the administrator, created by a magic link.

## Decision

1. **Verified claims.** `currentUser()` reads the session through `getClaims()`, which verifies the
   token before the app reads its authentication method references (`amr`).
2. **Allowed methods.** The app trusts a session only when its methods include an email link or code:
   `magiclink`, `otp`, `email/signup`, `invite`, `recovery` or `email_change`.
3. **Refused methods.** Any password, anonymous, OAuth, SSO or web3 method refuses the session, even
   alongside an email link. A second factor (`totp`, `mfa/*`) does not affect the result.
4. **Refusal is signed-out.** A refused session never claims a profile and never reads one. Pages
   redirect to `/login`, and Server Actions reject.
5. **Signed-out visitors.** Protected pages send them to `/login` through `requirePageUser()`, instead
   of failing with a server error.
6. **Confirmation (operator step).** The hosted project should also require email confirmation.
   First check that the "Confirm signup" template links to
   `/auth/confirm?token_hash={{ .TokenHash }}&type=signup`, as the checked-in template does. The
   app-side rule does not depend on this setting.

## Consequences

- A password never grants access, even one someone else set on an invited address.
- Magic links work as before. Existing sessions keep working, because they were created by email
  links and their method references survive token refresh.
- A refused password sign-up can still leave an Auth user for an invited address. It holds no data,
  the invitee's later email link signs in as that user and claims the profile normally, and an
  operator may delete it.
- An end-to-end story checks this against the local Auth stack: it registers an invited address with
  a password, presents that session to the app, and confirms the invitation stays unclaimed.
- If OAuth or passkeys are ever offered, this ADR must be revisited, because those methods are
  refused today.
