---
title: Verify eBay deletion notifications before acknowledgement
status: accepted
date: 2026-11-03
amends: ADR-025
---

# ADR-027: Verify eBay deletion notifications before acknowledgement

## Context

ADR-025 recovered the eBay Marketplace Account Deletion callback into source
control and removed sensitive payload logging, but its POST path acknowledged
every request. That did not expose or delete user data, because AutoHunter does
not persist other eBay users' account data, but it violated eBay's notification
contract and allowed forged traffic to consume Worker and log capacity.

eBay signs the exact request bytes with its legacy ECDSA/SHA-1 notification
protocol. Parsing and re-serializing JSON changes those bytes. The signing key
is identified by the bounded `kid` in `X-EBAY-SIGNATURE` and must be obtained
from eBay's fixed notification public-key API.

## Decision

1. The Worker bounds and buffers the raw request once, strictly decodes the
   signature envelope, permits only eBay's `ecdsa`/`SHA1` combination, and
   verifies the DER ECDSA signature over the exact bytes with Workers Web
   Crypto before returning `200`.
2. OAuth tokens and public keys are fetched only from fixed eBay API origins.
   Key IDs are syntax-bounded and encoded. Imported keys must be P-256 SPKI
   public keys; validated keys are cached for one hour.
3. Missing, malformed, unknown-key, and invalid-signature requests return
   `412`; oversized notifications return `413`; upstream credential or key
   service failures return `503` so delivery can retry.
4. Logs contain only a verification outcome and request ID. Payloads,
   signatures, user identifiers, OAuth tokens, client credentials, and the
   challenge token are never logged.
5. The existing GET challenge calculation and endpoint URL contract remain
   unchanged. eBay client ID and client secret join the challenge token as
   required Cloudflare secret bindings.

## Consequences

- Only provider-authenticated notifications are acknowledged.
- Exact redelivery remains safe and accepted because the callback has no
  payload-side mutation.
- Deployment now requires all three secret bindings and a live provider-backed
  verification after repository tests, type checks, audit, and dry-run bundle
  generation pass.
- The repository fixture matches eBay's published SDK envelope/key format; any
  future algorithm change requires an explicit protocol update rather than
  trusting header-selected cryptography.
