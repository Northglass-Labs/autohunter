# AutoHunter project context

AutoHunter is a private, invite-only household vehicle-intelligence product at
`autohunter.northglass.io`, endorsed exactly as **a Northglass Product**. It combines licensed used
inventory, structured OEM lease programs, authorized lease notifications, package evidence, private
decision queues, and deterministic reports (on each person's cadence, daily or every few days, when
something new clears a search, otherwise a weekly check-in; ADR-021).

## Runtime components

### `collector/`

Node 22 adapters sync opaque active searches, issue quota-bounded licensed requests, normalize
offers, recheck hard filters, preserve per-search matches, record source health, ingest batches, and
invoke due reports. Current adapters are MarketCheck inventory, Auto.dev inventory, MarketCheck OEM
incentives, bounded NHTSA model-year safety enrichment, and a read-only GOG importer for the
dedicated `AutoHunter/Lease Inputs` label.
Leasehackr scheduled crawling is prohibited; authorized notifications and manual imports are the
supported inputs. Camoufox is a disabled path left from the original manual-car monitor, which was
retired on 2026-10-11 (ADR-024); its removal is scheduled.

### `catcht/`

Next.js 16 and React 19 use Supabase email-link identity with server-authorized invited profiles;
only sessions an email link created are accepted (ADR-022).
The browser cannot access the private `catcht` schema. Canonical listings are shared; saved searches,
matches, decisions, digest/report runs, and resend state are owner-scoped. Resend delivers the same
typed report contract represented in `/reports`; email decision links require a confirmation POST.

## Product truth rules

- `active_offer` means current and economically comparable.
- `benchmark` means a completed deal useful for negotiation, never available inventory.
- `market_signal` means relevant but economically incomplete research.
- Equipment is confirmed only from provider detail/window-sticker-like evidence. Provider summary
  text (headings, descriptions) and exact model-year rules may mark expected equipment; everything
  else stays unknown. The ingest contract rejects confirmed evidence from any other source.
- Audi adaptive cruise assist, Genesis HDA (any generation), Volvo Pilot Assist, Porsche InnoDrive,
  VW Travel Assist, bare Nissan ProPILOT Assist, and BMW Active Driving Assistant Pro are hands-on
  systems. Cadillac Super Cruise, BMW Highway Assistant, Ford/Lincoln BlueCruise, Nissan ProPILOT
  Assist 2.x, and supported Rivian Enhanced Highway Assist can be hands-free only when explicitly
  evidenced or precisely model-year expected.
- Source failure, entitlement limits, and radius/query caps are visible states—not empty success.
- NHTSA ratings are conservative model-group context. Model-year campaign counts never imply that a
  specific VIN has an unrepaired recall; only the linked official VIN check establishes that.

## Compatibility and deployment

Preserve existing listing IDs, VIN correlation, decisions, and report history. The enthusiast
searches were deleted by owner decision on 2026-10-11 (ADR-024).
The `catcht` directory/schema names stay internal. Primary runtime variables and public surfaces use
AutoHunter; old environment names remain read-only fallbacks during cutover.

Production uses Vercel for the web app, Supabase for Auth/Postgres, a Northglass-verified sender,
Cloudflare DNS, and one daily scheduler. Send one administrator test report before enabling any
additional recipient.

## Verification

```bash
(cd catcht && npm test && npm run test:db && npm run test:e2e && npm run lint && npm run build && npm audit --omit=dev)
(cd collector && npm test && npm audit --omit=dev)
```

See `README.md`, `AGENTS.md`, `docs/standalone.md`, `docs/STATUS.md`, ADR-012, ADR-013, and ADR-014.
