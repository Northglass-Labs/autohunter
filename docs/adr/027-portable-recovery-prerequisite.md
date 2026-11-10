---
title: Prepare AutoHunter portable recovery from the preserved PostgreSQL helpers
status: proposed
date: 2026-11-09
---

# ADR-027: Prepare AutoHunter portable recovery

PR39 is held on real recovery and scoped credential access. The preserved
RateWatch helpers already supply PostgreSQL17 snapshots, streaming SSH+rclone
crypt, immutable encrypted objects, row-free receipts and isolated restore
guards. They are local-only recovery source and hardcode auth/public/private;
wrapping them unchanged would omit AutoHunter's catcht data.

Prepare an AutoHunter-owned derivative in ops/recovery, with exact upstream
commit/file hashes. Retain the existing design and adapt every dump, snapshot
inventory, receipt and restore schema boundary to auth/public/catcht. Reuse the
synthetic test harness, adding an actual catcht fixture and wrong-schema refusal.
Do not introduce another backup framework or modify the retired RateWatch tree.

This is a candidate, not installation or recovery proof. Actual use requires an
owner-reviewed fixed profile, reviewed CA and source/backup role, installed
immutable release and selected gateway/destination. Do not infer unknown vault
references or repurpose collector/Auth profiles. Production source, PR39 and
provider configuration remain unchanged.

The archive deliberately excludes transient Auth credentials/sessions, global
roles/grants, Storage object bytes, provider/Auth settings and secrets. Capture
the applicable excluded recovery classes separately before declaring full
application recovery or promotion. An isolated restore must prove real schema,
aggregate and authorization behavior; synthetic tests establish code contracts
only. Installation does not grant migration, user-binding, routing or release.
