# eBay account-deletion callback Worker

This Worker satisfies eBay's Marketplace Account Deletion callback contract for
AutoHunter's production eBay application. Its canonical endpoint is:

```text
https://ebay-account-deletion.tom-c-stetson.workers.dev/.well-known/ebay-deletion
```

`GET` returns eBay's SHA-256 challenge response. `POST` acknowledges a deletion
notification without persisting or logging the notification body, user
identifier, or signature. AutoHunter does not store other eBay users' account
data.

## Secret boundary

The verification token is the Cloudflare Worker secret binding
`EBAY_DELETION_VERIFICATION_TOKEN`. Its canonical value remains in 1Password
under the HomeLab vault reference `ebay-deletion-verification-token`; the value
must never be placed in this repository, Wrangler config, command arguments, or
logs. `.dev.vars*` and `.env*` are ignored for local-only test values.

## Verify and deploy

```bash
npm ci
npm run check
```

For a production change:

1. Confirm the current deployed version and run the live challenge probe.
2. Set `EBAY_DELETION_VERIFICATION_TOKEN` with `wrangler secret put`, supplying
   the value through the approved secret-store integration rather than a shell
   argument.
3. Run `wrangler deploy` only after `npm run check` passes.
4. Read back the deployed binding name/type, source hash, deployment version,
   and live challenge response. Cloudflare deliberately never returns a secret
   value after it is set.

If live verification fails, use `wrangler versions list` and `wrangler rollback`
to restore the immediately preceding deployment, then re-run the challenge
probe.
