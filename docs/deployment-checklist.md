# AutoHunter deployment checklist

This is the release gate for an invite-only AutoHunter installation. The detailed runbook is
[`standalone.md`](standalone.md).

## Accounts and credentials

- [x] Northglass-Labs repository access
- [x] Supabase project with PostgreSQL 17 and production Auth SMTP
- [x] Vercel project with Root Directory `catcht`
- [x] verified `northglass.io` sending domain and Resend credential
- [x] Cloudflare DNS control for `autohunter.northglass.io`
- [x] licensed MarketCheck and/or Auto.dev credentials
- [x] optional MarketCheck OEM-incentives entitlement
- [ ] optional Vercel AI Gateway or OpenAI credential for bounded photo verification

Generate independent high-entropy `ACTION_SIGNING_SECRET`, `INGEST_SECRET`, and `CRON_SECRET`
values. Store them only in scoped platform or host secret stores.

## Fresh-clone verification

```bash
git clone https://github.com/Northglass-Labs/autohunter.git
cd autohunter
nvm use

(cd catcht && npm ci && npm test && npm run test:db && npm run test:e2e && npm run lint && npm run build && npm audit --omit=dev)
(cd collector && npm ci && npm test && npm audit --omit=dev)
```

`test:e2e` resets only the local Supabase stack configured in `catcht/`. It must never point at the
hosted production project.

## Database and Auth

```bash
cd catcht
supabase link --project-ref <project-ref>
supabase db push --dry-run
supabase db push
psql "$SUPABASE_OWNER_DATABASE_URL" -f supabase/provision-app-role.psql
supabase db advisors
```

- [x] use the least-privilege pooled application URL as `DATABASE_URL`
- [x] set the Auth site URL to `https://autohunter.northglass.io`
- [x] allow only intentional `/auth/confirm` redirect origins
- [x] enable `catcht.authorize_invited_user` as the before-user-created hook
- [x] install the checked-in confirmation and magic-link templates unchanged
- [x] configure custom SMTP; local Mailpit is test-only
- [x] provision only intended normalized emails in `catcht.user_profiles`
- [x] keep all application tables in the private `catcht` schema
- [x] resolve every Supabase security-advisor error before release

## Web and mail

```bash
vercel link
vercel deploy --prod
```

- [x] configure the variables in `catcht/.env.example`; only the two `NEXT_PUBLIC_SUPABASE_*`
  identity values may be browser-visible
- [x] set `APP_URL=https://autohunter.northglass.io`
- [x] set `EMAIL_FROM=Northglass AutoHunter <carhunt@northglass.io>`
- [x] map the canonical Vercel domain and Cloudflare DNS record
- [x] verify anonymous `/` redirects to `/login`
- [x] verify protected collector and digest routes return 401 without credentials
- [x] consume a real administrator magic link and sign out again
- [x] prove a second test profile cannot read or mutate the administrator's searches, decisions, or
  reports
- [x] send one deliberate report to the administrator and verify sender, rendering, links, images,
  and source-health content before enabling any other recipient

## Collector and scheduler

```bash
cd ../collector
cp platform.example.json platform.local.json
npm run platform:health -- --config platform.local.json
npm run platform:collect -- --config platform.local.json
npm run platform:cycle -- --config platform.local.json
```

- [x] inject `AUTOHUNTER_APP_URL`, `AUTOHUNTER_INGEST_SECRET`, `AUTOHUNTER_CRON_SECRET`, and
  provider credentials from a secret store
- [x] create the dedicated `AutoHunter/Lease Inputs` Gmail label before enabling `email:cycle`
- [x] install the pinned GOG binary with owner-only permissions for unattended Gmail intake
- [x] confirm each enabled source records fresh, truthful health
- [x] verify one NHTSA-rated model and one not-rated model render honestly, then follow the official
  VIN recall link
- [x] confirm at least one real listing image and source link render
- [x] enable one daily GitHub Actions, launchd, or systemd schedule
- [x] verify a second unattended run and report idempotency

## Security and release

- [x] run a repository-wide secret scan and dependency audit
- [x] test Auth enumeration resistance, redirect validation, IDOR boundaries, and signed-action replay
- [x] inspect generated HTML and browser bundles for server credentials
- [x] inspect production logs without printing secret values
- [x] verify desktop and mobile flows with console, network, image, and overflow checks
- [x] publish only after personal identifiers, private locations, stale product names, and obsolete
  infrastructure instructions are removed
- [x] mark the paused predecessor lease watcher superseded only after the replacement production
  report succeeds
