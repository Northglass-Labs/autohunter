---
title: Source-control the eBay deletion callback and bind its verification token as a secret
status: accepted
date: 2026-11-02
---

# ADR-025: Source-control the eBay deletion callback and bind its verification token as a secret

## Context

The production `ebay-account-deletion` Cloudflare Worker was deployed through
the API on 2026-05-02 but had no source owner in the local or Git inventory.
Live readback on 2026-11-02 recovered a 1,992-byte classic Worker whose source
contained the current verification token as a string literal. The Worker had no
bindings. This made recovery dependent on provider history and exposed the
verification material to every principal allowed to read Worker source.

The callback is an AutoHunter production dependency: eBay requires the endpoint
for its production application even though AutoHunter stores no third-party
eBay account data.

## Decision

1. AutoHunter owns the Worker source under
   `workers/ebay-account-deletion/`.
2. The Worker uses ES modules and reads
   `EBAY_DELETION_VERIFICATION_TOKEN` from a required Cloudflare secret binding.
   The value remains canonical in 1Password and is never committed.
3. The Worker preserves the live GET challenge and POST acknowledgement
   contract. It stops logging POST bodies and eBay signatures; logs contain only
   a structured acknowledgement event, timestamp, and callback path.
4. `wrangler.jsonc`, generated binding/runtime types, Workers-runtime tests, and
   a dry-run bundle are the deployment gate. Query strings are redacted from
   persisted Workers observability.
5. A verification-token rotation requires a coordinated eBay Developer setting
   change and Worker-secret update. Moving the current value out of source is
   safe independently; rotation must not be guessed or performed as a one-sided
   change that would break eBay's challenge.

## Consequences

- Git now owns the recoverable production implementation and deployment
  configuration.
- Cloudflare source read permission no longer reveals the token after the
  secret-backed version is deployed.
- Notification payloads no longer enter Workers logs.
- The callback retains a single external dependency on the coordinated eBay
  verification-token setting. Its rotation remains an operator transaction
  until an authenticated eBay credential path is available.
