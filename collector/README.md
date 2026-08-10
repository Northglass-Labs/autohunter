# AutoHunter collector

The AutoHunter collector is a scheduler-neutral Node.js 22 process that converts licensed or
user-authorized source responses into one normalized offer contract. The normal runtime needs only
outbound HTTPS. It has no inbound listener, agent runtime, browser daemon, CAPTCHA service, or
mandatory secret-manager dependency.

## Commands

```bash
cp platform.example.json platform.local.json
npm ci
npm test
npm run platform:health -- --config platform.local.json
npm run platform:collect -- --config platform.local.json
npm run platform:cycle -- --config platform.local.json
```

- `platform:health` checks configured adapters without ingesting or sending mail.
- `platform:collect` syncs active searches, runs adapters, deduplicates candidates, and posts offers
  plus source health to the application.
- `platform:cycle` collects and then asks the application to run due reports. Per-user run keys,
  cooldowns, and resend suppression make retries safe.
- `email:cycle` optionally imports a dedicated operator-owned Gmail label through GOG in read-only,
  no-send mode.

Primary runtime variables are `AUTOHUNTER_APP_URL`, `AUTOHUNTER_INGEST_SECRET`,
`AUTOHUNTER_CRON_SECRET`, `AUTOHUNTER_CONFIG`, `AUTOHUNTER_GMAIL_QUERY`,
`MARKETCHECK_API_KEY`, and `AUTODEV_API_KEY`. Older `CAR_HUNT_*` and `CATCHT_*` names are temporary
runtime aliases only. See [`.env.example`](.env.example).

## Supported adapters

### MarketCheck inventory

- Licensed used, new, and CPO inventory.
- Query and response validation enforce make, model, trim, ZIP, radius, price, mileage,
  transmission, and image requirements.
- Shared canonical vehicles can match several users' searches without sharing decisions.
- Detail responses are bounded and cached per run; provider radius limits appear in source health.
- Persisted listing and image URLs are public HTTPS URLs and never contain the provider credential.

### Auto.dev inventory

- Licensed used, new, and CPO inventory through the documented `/listings` API.
- Bearer authentication stays in the request header; it never appears in URLs or logs.
- The provider's 20-row page ceiling, ZIP distance, and every saved-search hard limit are enforced
  again after normalization.
- Only public HTTPS source links and real listing images are accepted.

### MarketCheck OEM incentives

- Structured regional lease programs from the licensed OEM incentives API.
- Searches are grouped by make and ZIP and normalized into payment, term, mileage, due-at-signing,
  fees, deposits, incentives, tax treatment, and validity dates.
- Incomplete economics remain market signals; signed examples remain benchmarks; neither is
  presented as an active offer.
- A missing plan entitlement reports `plan_upgrade_required` instead of retrying or scraping.

### NHTSA safety enrichment

- Uses only the official model-year/make/model recall and 5-Star Safety Ratings APIs.
- Shares one bounded result across matching providers, listings, and users.
- Conservatively retains the lowest valid crash rating among the inspected variants and discloses
  variant coverage.
- Stores only campaign number, component, and received date—never raw narratives or remedies.
- Does not perform bulk VIN lookup. The product links the buyer to NHTSA for a specific VIN's open
  recall status.
- Missing ratings, query caps, rate limits, and API failures remain explicit without dropping
  inventory or changing deal scores.

### User-authorized Gmail lease inputs

- Reads only `AutoHunter/Lease Inputs`, or another explicitly configured label, through GOG's
  read-only/no-send JSON mode.
- Unattended runs use an integrity-pinned owner-only binary at
  `~/.local/bin/gog-autohunter-0.34.0`.
- Stores normalized facts and the public source link, never the message body, sender, recipient, or
  mailbox-wide history.
- Refundable multiple security deposits are excluded from effective monthly cost. First payment,
  acquisition fees, nonrefundable drive-off, and true zero-DAS offers are modeled explicitly.
- A dealer offer missing core economics fails closed. Editorial updates can be retained only as a
  clearly labeled market signal; signed examples are comparison-only benchmarks.

### Leasehackr inputs

Scheduled page crawling is disabled because the source's current terms prohibit it. The parser is
available only for user-authorized email notifications, operator-supplied exports, and bounded
manual fixtures. An unavailable source is reported as unavailable, never as zero deals.

## Adapter contract

Every adapter returns `{ offers, run }` and must:

1. use a licensed or expressly authorized retrieval path;
2. revalidate every saved-search hard limit after parsing;
3. preserve provenance and the public source link;
4. accept bounded public HTTPS URLs and payload sizes only;
5. emit explicit freshness, coverage, quota, and failure health;
6. keep credentials, headers, raw mailbox content, and protected page content out of persistence and
   logs.

## Scheduling and secret handling

Use the checked-in GitHub Actions workflow, launchd template, or systemd timer. Inject credentials
from the scheduler's secret store or a scoped service account. Do not put values in JSON profiles,
plists, unit files, argv, logs, or Git.

The standard cycle is daily. The application, not the scheduler, decides whether each user's report
is due. Run `platform:health` first, then one deliberate `platform:collect`, then one
`platform:cycle` before enabling an unattended timer.

## Legacy browser code

The `collect`, `cycle`, `health`, and `browser:install` commands are disabled migration utilities
from the predecessor installation. They are not used by `platform:*`, are not authorized coverage,
and must not be pointed at a source without written permission. The optional Camoufox payload is
downloaded only by an explicit `npm run browser:install`; AutoHunter has no CAPTCHA-solving path.

The historical `.catcht/` profile directory is private, gitignored state. Do not publish, copy, or
deploy it.
