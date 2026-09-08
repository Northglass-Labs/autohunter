---
title: W222 value searches use explicit body restrictions and model-specific package evidence
status: accepted
date: 2026-09-08
extends: ADR-012 and ADR-015
---

# ADR-016: W222 search and equipment boundaries

The owner wants well-optioned 2018–2020 S560 sedans under $25,000. S-Class provider names also
cover coupes and the S560e hybrid. Existing make-wide request groups mix inexpensive older sedans
with newer EQS/GLS inventory, while substring trim matching can admit the wrong powertrain.

Add an optional, validated `saved_searches.body_style` and enforce it in both licensed adapters
and server-side ingest evaluation. A requested body style with missing evidence fails closed.
Body-restricted searches share requests within their own make/type/ZIP/body group. Existing
request ceilings, detail cache and daily detail limit stay unchanged. The W222 pair adds one
bounded search group per inventory provider; unavailable coverage remains explicit.

Trim matching uses whole normalized tokens and explicit aliases, including S 560/S560; S560e
remains distinct. Both AWD and RWD qualify. The S560 and S450 discovery presets use a $25,000
asking-price cap, 2018–2020 model years, and a provisional 120,000-mile ceiling. Production
activation is scoped to the requesting owner using the existing search location and radius.
No other user's searches are seeded by a migration.

Smartphone and comfort feature keys extend the existing evidence contract. US W222 sedan
Premium and Driver Assistance package content can establish equipment only when the exact
package is named. Provider summaries stay expected; provider details can confirm. Optional
packages never become factory-standard rules. Generic audio, availability prose and negations
cannot establish the rare Burmester 3D upgrade. MBC is not credited on AWD evidence.

Unknown options remain discoverable because low-price listings may omit option detail. Buyers
can select required features themselves, with the existing confirmed-or-expected semantics.
The interface and emails expose the unresolved checks and link to the validated buying guide.
An inexpensive asking price never establishes condition or low ownership cost.

Source health now also requires a recent (48-hour) valid timestamp. Historical success is retained
as data but cannot be counted as healthy current coverage. This fixes a stale authorized-email
source being displayed as healthy without changing mailbox scope or scheduling.
