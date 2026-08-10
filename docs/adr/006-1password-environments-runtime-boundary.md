---
title: Mookmobile keeps project secrets in 1Password Environments
status: superseded
date: 2026-07-12
amended: 2026-07-16
superseded-by: ADR-012
supersedes: Mookmobile local FIFO and direct Keychain credential paths
---

# ADR-006: Mookmobile keeps project secrets in 1Password Environments

## Context

The reusable Car Hunt product is secret-manager-neutral, but the live Mookmobile instance already has
a project-scoped production Environment in 1Password. During the standalone refactor, its mounted
`.env.local` FIFO moved with the application directory while 1Password retained the retired mount
path. The resulting orphan FIFO had no writer and blocked Next.js builds. A separate launchd wrapper
also copied collector credentials into the macOS login Keychain; direct shell reads of that item
caused repeated password dialogs when the keychain was locked.

There are now three intentionally separate 1Password paths:

- the official 1Password Environments MCP, which uses desktop approval to manage project/stage
  Environments and returns variable names rather than values; and
- the Agent-vault path in `1pass-agent-plugin`, which uses a service account scoped to the Agent
  vault and injects selected item fields into child processes without returning them to the agent;
  and
- the Environment runtime path in that plugin, which uses a different read-only service account
  scoped to one stable Environment and permits only an operator-installed, integrity-pinned profile.

## Decision

Keep the Mookmobile production Environment as the canonical source for project-specific application
configuration. Keep Vercel and other platform secret stores as runtime destinations or verified
copies, not independent sources of truth.

Do not merge the management, Agent-vault, and Environment-runtime trust boundaries. The official
Environments MCP may be used for explicit metadata and interactive management, but not as an
unattended runtime dependency. The Agent-vault service account must never gain Environment access.
The plugin's Environment path may health-check one stable ID and run one host-owned profile, but it
must not list, read, return, edit, mount, sync, or delete Environment data.

Local FIFO `.env` mounts are optional interactive-development conveniences only. Car Hunt must build
and test without a mounted file, and an always-present FIFO is not part of the repository contract.
Committed `.env.example` files remain the non-secret configuration schema.

The unattended collector uses a separate read-only service account scoped only to the Mookmobile
Environment. A host-owned runner injects the selected values through `op run --environment` into an
exact Node command whose executable and first-party files are hash-pinned. The installed stable
1Password CLI remains unchanged; Environment support uses an official signed beta installed only
inside the plugin runtime and checked by archive hash, binary hash, signature, Apple Team ID,
version, and capability before activation. A platform-native secret store remains an acceptable
runtime destination on another host. No command may print Environment values, place them in argv,
logs, model context, or a plaintext file.

The Mookmobile collector maps only `APP_URL`, `INGEST_SECRET`, `CRON_SECRET`, and
`MARKETCHECK_API_KEY` to their intended child variables. It must not receive the MarketCheck OAuth
client secret, database, signing, recipient, or allowlist variables.

## Consequences

- Mookmobile keeps project/stage grouping and rotation without plaintext `.env` files.
- Car Hunt remains independently installable with any suitable secret manager.
- Interactive approvals and FIFO concurrency cannot break scheduled collection.
- Shared agent credentials remain in the Agent vault; project configuration remains in Environments;
  their service-account tokens and allowed operations remain distinct.
- The stale 1Password destination at the retired application path is disabled, and its orphan FIFO
  in the current application directory has been removed.
- launchd receives a real local exit status from the stable host runner, while MCP callers receive
  neither child output nor child status.
