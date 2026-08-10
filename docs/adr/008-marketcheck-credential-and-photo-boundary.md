---
title: Keep MarketCheck credentials out of persisted URLs
status: accepted
date: 2026-07-16
---

# ADR-008: Keep MarketCheck credentials out of persisted URLs

## Context

MarketCheck inventory search supports API-key authentication in the query string. Its inventory
response can append that key to returned links, and its cached-image endpoint requires provider
authentication. Persisting those URLs would copy a credential into Postgres, rendered HTML, email,
browser history, and downstream image requests. Removing the key from a cached-image URL instead
produces a broken image.

The same inventory response also includes original dealer/CDN photo links. Live verification found
those public links returned JPEG content without credentials while the corresponding MarketCheck
cache URL returned HTTP 401.

## Decision

- Send `append_api_key=false` on every inventory request.
- Defensively remove an `api_key` query parameter from normalized listing and public photo URLs.
- Persist only original `media.photo_links`; never persist `media.photo_links_cached`.
- Reject inventory that has no usable public dealer photo instead of creating a broken card.
- Inject only `MARKETCHECK_API_KEY` into the v1 REST collector. Keep the separately issued OAuth
  client secret in the canonical secret store but outside the collector child environment.

## Tradeoffs

Dealer-hosted images can disappear or enforce their own hotlink policy, while MarketCheck's cache
may be more durable. Using that cache safely would require a server-side authenticated image proxy,
key rotation, cache policy, and additional provider calls. V1 chooses the smaller credential
surface and truthful source health over that added runtime.

## Consequences

- Database rows, dashboard HTML, email markup, and browser requests contain no MarketCheck API key.
- Cards use actual public dealer photos and fail closed when only credential-gated cache media is
  available.
- A future authenticated proxy or OAuth migration must be reviewed as a separate architecture
  change rather than silently reintroducing provider credentials into URLs.
