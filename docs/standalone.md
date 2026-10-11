# Standalone AutoHunter deployment

This runbook creates a private, invite-only AutoHunter instance using Next.js, Supabase, Vercel,
Resend, and one or more licensed or user-authorized collectors. Hermes, OpenClaw, a persistent
browser, and 1Password are not product dependencies.

## 1. Prerequisites

- Node.js 22 and npm; `.nvmrc` is authoritative
- Supabase CLI, PostgreSQL `psql`, and a Docker-compatible runtime for local database/E2E tests
- an empty Supabase project and a Vercel project rooted at `catcht/`
- Resend plus a verified sending domain
- licensed MarketCheck or Auto.dev access; OEM-incentive access is optional
- DNS control for the canonical HTTPS origin
- a daily scheduler such as GitHub Actions, launchd, or systemd

The ordinary collector needs outbound HTTPS only.

## 2. Verify a fresh clone

```bash
nvm use
(cd catcht && npm ci && npm test && npm run test:db && npm run test:e2e && npm run lint && npm run build && npm audit --omit=dev)
(cd collector && npm ci && npm test && npm audit --omit=dev)
```

The local E2E runner starts/resets the local Supabase project only. Never configure it with a hosted
production database URL.

## 3. Provision the private database

```bash
cd catcht
supabase link --project-ref <project-ref>
supabase db push --dry-run
supabase db push
psql "$SUPABASE_OWNER_DATABASE_URL" -f supabase/provision-app-role.psql
supabase db advisors
```

Historical migrations retain the internal `catcht` schema and an earlier schema rename so existing
installations preserve IDs and history. The finished application schema is revoked from `PUBLIC`,
`anon`, `authenticated`, and `service_role`; the browser receives Auth identity only.

Use the provisioned role's transaction-pooler URL as `DATABASE_URL`. Store the project CA as the
complete `DATABASE_CA_CERT` PEM and use `DATABASE_SSL_MODE=verify-full` in production. The app fails
closed when production TLS configuration is missing or invalid.

## 4. Configure invite-only Auth

1. Set the Supabase Auth site URL to the canonical origin and allow only intentional
   `/auth/confirm` redirects.
2. Enable `catcht.authorize_invited_user` as the before-user-created hook. Once step 3's templates
   are in place, require email confirmation; the app accepts only email-link sessions either way
   (ADR-022).
3. Install `supabase/templates/confirmation.html` and `magic-link.html` without changing the
   token-hash, callback, or type query parameters.
4. Configure custom SMTP. Mailpit exists only for deterministic local tests.
5. Insert each intended normalized email into private `catcht.user_profiles` before that person
   requests a link.

Unknown and invited addresses receive the same login response. The callback exchanges a one-time
code for HTTP-only cookies, validates the identity with Supabase, then requires an active private
profile. Every data read and mutation also constrains the current profile; cookie refresh is not an
authorization boundary.

## 5. Configure and deploy the web app

Use [`catcht/.env.example`](../catcht/.env.example) as the environment contract. Generate
`ACTION_SIGNING_SECRET`, `INGEST_SECRET`, and `CRON_SECRET` independently with at least 32 random
bytes. Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` may be public.

Important production values:

```text
APP_URL=https://autohunter.northglass.io
APP_NAME=AutoHunter
EMAIL_FROM=Northglass AutoHunter <carhunt@northglass.io>
DATABASE_SSL_MODE=verify-full
```

Never prefix a database, signing, ingestion, scheduler, mail, or AI credential with `NEXT_PUBLIC_`.

```bash
vercel link
vercel deploy --prod
```

Map the production domain only after the deployment is ready. Anonymous `/` should redirect to
`/login`; `/api/collector/config`, `/api/ingest`, and `/api/cron/digest` should reject missing or
incorrect server credentials.

## 6. Configure licensed and authorized sources

```bash
cd ../collector
cp platform.example.json platform.local.json
npm ci
npm test
```

With `syncSavedSearches: true`, the protected application is authoritative for active searches.
Inject these values at runtime rather than storing them in JSON or Git:

```text
AUTOHUNTER_APP_URL=https://autohunter.northglass.io
AUTOHUNTER_INGEST_SECRET=<same bytes as web INGEST_SECRET>
AUTOHUNTER_CRON_SECRET=<same bytes as web CRON_SECRET>
AUTOHUNTER_CONFIG=./platform.local.json
MARKETCHECK_API_KEY=<optional licensed key>
AUTODEV_API_KEY=<optional licensed key>
```

MarketCheck inventory, Auto.dev inventory, and MarketCheck OEM incentives are the supported offer
adapters. Bounded NHTSA model-year safety enrichment is enabled separately and needs no credential.
Provider-plan caps are enforced and surfaced in health. Missing credentials and rejected
entitlements are unavailable coverage, not empty searches. NHTSA enrichment never bulk-queries VINs;
the listing links to the official VIN recall check.

Leasehackr pages are not crawled under their current terms. Lease inputs can arrive through a
dedicated user-owned Gmail label, a user-supplied export, or another authorized feed. The optional
GOG bridge reads only `AutoHunter/Lease Inputs`, uses read-only/no-send mode, and persists normalized
economics plus a public source link—not message bodies or mailbox identities.

For unattended GOG use, pin a verified copy to `~/.local/bin/gog-autohunter-0.34.0`, owned by the
runtime user and mode 0700 or stricter. Never execute a mutable, group-writable package-manager path
from a scheduler.

## 7. Run and schedule

```bash
npm run platform:health -- --config platform.local.json
npm run platform:collect -- --config platform.local.json
npm run platform:cycle -- --config platform.local.json
```

Read-only health comes first. Then perform one deliberate ingest and one deliberate report cycle.
Send the first production report to the administrator only and inspect it before enabling another
recipient.

Schedule `platform:cycle` daily. The application owns each profile's calendar-date run key,
unchanged-listing suppression, and quiet-day rule (no email without new candidates; a check-in after
seven quiet days), so scheduler delay does not skip a day and repeated invocations do not duplicate
mail. The collector applies each metered source's own cadence (ADR-018).
Use `.github/workflows/collector.yml` or the checked-in launchd/systemd templates. Secret values must
come from repository, platform, or host secret stores—not workflow YAML, unit files, argv, or logs.

## 8. Interpret source health

- `success`: normalized offers passed all source and saved-search filters
- `empty`: the authorized source ran correctly but produced no match
- `unavailable`: credential, entitlement, policy, or deliberately disabled coverage
- `challenged`: a disabled browser-migration path encountered an access challenge and stopped
- `failed`: bounded network, response, or parser failure

Each result also records freshness, counts, and provider limitations. One healthy adapter never
makes a failed or unavailable adapter look healthy. Freshness is judged per source: 72 hours for
MarketCheck inventory, nine days for OEM lease programs, 48 hours otherwise. An adapter that keeps
searching but has returned no provider results for seven days is reported as needing attention.
Reports show only the sources serving the recipient's active offer kinds.

`GET /api/health/sources` applies the same rules to the scheduled sources: MarketCheck inventory,
Auto.dev, OEM lease programs, and NHTSA.
- While every one of them is healthy, it answers `200 {"status":"ok"}`. Otherwise it answers
  `503 {"status":"degraded"}`.
- It reveals nothing else, so an uptime monitor can poll it without credentials. The dashboard
  shows which source needs attention.
- Optional and manual inputs, such as the email importer, do not affect it.

## 9. Release verification

- consume real magic links on desktop and mobile
- prove profile-scoped searches, decisions, and reports cannot cross users
- test Interested, Pass, restore, invitation, ownership transfer, and sign-out
- render real listing images and source links; inspect console, network errors, and overflow
- verify one accepted report and one idempotent retry
- run Supabase security advisors, dependency audits, and a repository secret/security scan
- confirm no server secret exists in browser output, persisted URLs, Git, or logs

The complete gate is [`deployment-checklist.md`](deployment-checklist.md).

## 10. Backups and limits

Supabase is the durable source of truth. Enable tier-appropriate backups and test a logical restore
into a separate project. Collector state is disposable. Keep credential backups in the credential
provider, not database dumps or the repository.

AutoHunter currently provides a private invited-user product, not open signup, billing, a public
marketplace, or a general scraping service. Data quality and coverage depend on licensed provider
plans and authorized alert inputs. Direct site changes must be handled by bounded adapters and
truthful health, never aggressive retries or access-control bypasses.
