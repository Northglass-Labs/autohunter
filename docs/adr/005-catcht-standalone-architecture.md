---
title: Catcht is standalone and scheduler-neutral
status: superseded
date: 2026-07-12
supersedes: ADR-004 collector and delivery decisions
superseded-by: ADR-007
---

# ADR-005: Catcht is standalone and scheduler-neutral

## Context

Mookmobile proved the product loop: aggregate discovery, direct listing photos, conservative manual
verification, durable deduplication, a private dashboard, and email actions. Its first collector and
delivery path depended on a Hermes agent, a locally hosted Camoufox REST wrapper, a 1Password FIFO,
and a Gmail CLI. That was useful for rapid validation but made the repository hard to reproduce on
another machine and obscured which parts were product requirements versus home-lab adapters.

The application also hard-coded its recipient's name, location, and the Mookmobile brand. Adding a model
in the dashboard did not automatically update a separate local JSON search profile.

## Decision

Name the reusable product **Catcht** and keep **Mookmobile** as one environment-configured instance.
Split it into two independently deployable components:

1. `collector/` is a plain Node 22 process using `camoufox-js` directly. It owns pacing, persistent
   browser state, AutoTempest discovery, direct-source validation, challenge detection, structured
   facts, and actual-photo extraction. It exposes one scheduler-neutral `cycle` command.
2. `catcht/` is the Next.js API/dashboard. It owns the private Postgres schema, candidate validation,
   photo vision, ranking, deduplication, recipient decisions, and Resend delivery.

The authenticated `/api/collector/config` endpoint returns active database models and the effective
search policy. The collector merges those values with local source-specific slugs before each run.
Any scheduler can execute the cycle. The predecessor Hermes/OpenClaw browser helper and Gmail
adapter are retired rather than shipped as parallel product paths.

Used inventory is the only current collection contract. The versioned config reserves `condition`,
but `new` fails closed until a dedicated adapter is built. The collector never solves CAPTCHAs or
bypasses access controls, and an access challenge is a terminal result for that page in that run.

Rename the live database schema forward from `mookmobile` to `catcht`, preserving immutable migration
history. Keep old token namespaces/session cookie names for compatibility with already-issued links.

## Consequences

- A new operator can install Catcht using only Node, Supabase/Postgres, a Next.js host, Resend, and
  optional OpenAI vision.
- The live Mookmobile app retains its look and behavior through environment configuration.
- Dashboard model additions affect the next collector run without editing a prompt or agent job.
- Source access problems are measurable collector results rather than model hallucinations or rejects.
- Resend is the only mail path; Gmail/Hermes is not part of the product architecture or repository.
- New cars, Facebook Marketplace, multi-recipient tenancy, and financing remain explicit future work.
