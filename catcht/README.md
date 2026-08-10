# AutoHunter web application

This package owns AutoHunter's invite-only decision desk, saved searches, validated ingest,
evidence-aware ranking, per-user decisions, daily report archive, email rendering, and optional
manual-shifter photo verification. `catcht` is a historical directory/schema name retained for
database compatibility; the product is AutoHunter.

## Stack and trust boundary

- Next.js 16 App Router, React 19, TypeScript
- Supabase Auth passwordless email links with `@supabase/ssr`
- active `catcht.user_profiles` invitation required by a before-user-created hook
- direct server-only Postgres access to a private schema outside the Supabase Data API
- global canonical listings/evidence; owner-scoped searches, matches, decisions, and reports
- Resend daily reports with signed, confirmation-gated Interested/Pass actions
- optional OpenAI or Vercel AI Gateway vision for bounded manual-shifter evidence

`proxy.ts` refreshes Auth cookies. It is not an authorization boundary. Every protected page,
route, and Server Action validates the Supabase user and active private profile. Foreign report IDs
return 404 without rendering listing data.

## Local verification

Docker is required for the isolated Supabase/Postgres/Auth/Mailpit browser suite.

```bash
nvm use
npm ci
npm test
npm run test:db
npm run test:e2e
npm run lint
npm run build
npm audit --omit=dev
```

`npm run test:e2e` starts/resets only the local project and exercises real magic-link delivery on
desktop Chromium and a Pixel-sized mobile viewport. It covers anonymous redirects, sign-in/out,
cross-user searches/listings/decisions/reports, report IDOR denial, search creation, real HTTPS
photos/source links, invitations, and ownership transfer.

## Database and Auth

Preview migrations before applying them:

```bash
supabase db reset --local
supabase test db
supabase db push --dry-run
supabase db push
```

Production Auth must use `https://autohunter.northglass.io` as the site URL and allow the exact
`/auth/confirm` callback. Install the checked-in confirmation/magic-link templates and enable
`catcht.authorize_invited_user` as the before-user-created Postgres hook. Provision invited profile
emails privately; never commit them.

## Server routes

| Route | Authorization | Purpose |
|---|---|---|
| `GET /login` | public generic response | request an invited magic link |
| `GET /auth/confirm` | one-time Supabase token hash | establish a cookie session |
| `GET /reports` | active profile | list only that user's report history |
| `GET /reports/[id]` | active profile + owned run | show a historical evidence snapshot |
| `POST /api/ingest` | `Bearer INGEST_SECRET` | validate and upsert offers/source runs |
| `GET /api/collector/config` | `Bearer INGEST_SECRET` | return opaque active search definitions |
| `GET /api/cron/digest` | `Bearer CRON_SECRET` | send due per-user reports |
| `GET /action`, `POST /api/action` | signed one-time token | confirm a report decision |

The collector API never returns user email, Auth ID, role, cookie, or decision data.

## Environment

Use [`.env.example`](.env.example) as the contract. Only
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are intentionally public.
Never expose the database URL, database CA, action/ingest/cron secrets, mail key, or AI credential.

For Vercel, set this directory as Root Directory. The collector is deployed/scheduled separately.
See the root README and [`../docs/standalone.md`](../docs/standalone.md).
