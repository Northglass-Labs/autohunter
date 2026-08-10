<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AutoHunter web rules

- Read the repository `AGENTS.md`, `CLAUDE.md`, `docs/STATUS.md`, ADR-011, and ADR-012 before
  changing Auth, ownership, source roles, reports, or digest behavior.
- Supabase Auth provides identity only. The private `catcht` schema remains server-only, and every
  protected page, route, and Server Action must authorize through `currentUser()`/`requireUser()`.
- Keep listings and evidence canonical; scope searches, matches, decisions, digest/report runs, and
  resend state to `user_profiles.id`. Report detail queries must constrain both report and owner ID.
- Database changes require a new Supabase migration plus pgTAP coverage. Auth, ownership, reports,
  and protected-route changes also require real Mailpit-backed Playwright stories for desktop and
  mobile.
- Run `npm test`, `npm run test:db`, `npm run test:e2e`, `npm run lint`, and `npm run build` before
  claiming the web app is ready.
- Never expose the database URL, server signing/API/mail keys, or Supabase secret/service-role keys.
  The Auth project URL and publishable key are the only intended `NEXT_PUBLIC_` values.
