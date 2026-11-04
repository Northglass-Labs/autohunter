# eBay account-deletion callback Worker

This Worker satisfies eBay's Marketplace Account Deletion callback contract for
AutoHunter's production eBay application. Its canonical endpoint is:

```text
https://ebay-account-deletion.tom-c-stetson.workers.dev/.well-known/ebay-deletion
```

`GET` returns eBay's SHA-256 challenge response. `POST` bounds the raw body,
validates eBay's signature envelope, obtains and caches the identified eBay
P-256 public key, and acknowledges only a signature that verifies over those
exact bytes. The Worker does not persist or log the notification body, user
identifier, or signature. AutoHunter does not store other eBay users' account
data.

## Secret boundary

The Cloudflare Worker requires three secret bindings:

- `EBAY_DELETION_VERIFICATION_TOKEN` for the GET challenge contract;
- `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` for eBay's application-token and
  notification public-key APIs.

Their canonical values remain in the approved secret store. Values must never
be placed in this repository, Wrangler config, command arguments, or logs.
`.dev.vars*` and `.env*` are ignored for local-only test values.

## Verify and deploy

```bash
npm ci
npm run check
node ../../.github/scripts/audit-gate.mjs production
node ../../.github/scripts/audit-gate.mjs full
```

For a production change:

1. Confirm the current deployed version and run the live challenge probe.
2. Confirm all three required bindings above exist, using `wrangler secret put`
   through the approved secret-store integration rather than shell arguments
   for any missing or rotated value.
3. Run `wrangler deploy` only after the checks and both dependency-audit modes above pass.
4. Read back the deployed binding name/type, source hash, deployment version,
   and live challenge response. Cloudflare deliberately never returns a secret
   value after it is set.

If live verification fails, use `wrangler versions list` and `wrangler rollback`
to restore the immediately preceding deployment, then re-run the challenge
probe.
