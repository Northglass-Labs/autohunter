# AutoHunter portable recovery candidate

Status: offline-qualified candidate, not installed and not a production backup.
See ADR027 and provenance.json. The exact preserved upstream helpers are reused
with AutoHunter identity and auth/public/catcht schema adaptation; there is no
runtime dependency on the mutable RateWatch checkout.

## What is concrete now

- `scripts/backup-portable-postgres.sh`: default non-mutating preflight;
  explicit exact-source execution; PostgreSQL17 custom archive from an exported
  consistent snapshot streamed through SSH to an existing rclone crypt remote.
- Archive byte/SHA256/TOC and same-snapshot aggregate parity; remotely immutable
  row-free receipt; no local plaintext database archive, no object deletion.
- `scripts/verify-portable-postgres-restore.sh`: separate target confirmation;
  production-project denylist; named empty PostgreSQL17 destination; single-
  transaction restore and aggregate/transient-Auth checks; separate receipt.
- `scripts/run-portable-postgres-backup-scheduled.sh`: retained lock/process-
  group and preflight/execute contract. No scheduler is installed by this tree.
- Synthetic fixtures cover actual catcht aggregate rows and receipt schema,
  source/target binding, certificate hashes/verify-full, secret-free output,
  receipt widening refusal, TOC producer-SIGPIPE handling with other failures
  rejected, overlap and descendant cleanup. They contact no
  database, SSH server, B2 object or credential store.

From this directory:

```sh
node --test tests/portable-postgres-backup.test.mjs tests/portable-postgres-operations.test.mjs
bash -n scripts/backup-portable-postgres.sh
bash -n scripts/verify-portable-postgres-restore.sh
bash -n scripts/run-portable-postgres-backup-scheduled.sh
```

## Exact command candidates for operator review

Use the existing 1Password Agent trusted-profile boundary. This document does
not authorize profile installation and intentionally contains no guessed
`op://` reference. Each operation has a separate fixed command/profile scope.

| Purpose | Fixed command, from the reviewed release's ops/recovery directory |
| --- | --- |
| Source/gateway preflight | `/usr/local/bin/node --run backup` |
| One encrypted recovery point | `/usr/local/bin/node --run backup -- --execute --confirm-source-id vbnowzvaoyilhylrowku` |
| Verify a known artifact | `/usr/local/bin/node --run backup -- --verify-receipt <existing-operator-reviewed-receipt>` |
| Isolated target preflight | `/usr/local/bin/node --run restore -- --receipt <existing-operator-reviewed-receipt>` |
| One isolated restore | `/usr/local/bin/node --run restore -- --execute --receipt <existing-operator-reviewed-receipt> --confirm-target-id <reviewed-drill-id>` |

Angle-bracket entries are unresolved installation inputs, not executable
commands or invented profile IDs. Resolve them to existing pinned files before
installing the corresponding profile. Do not let callers supply arbitrary
arguments, environment, target, command or receipt path at runtime.

The fixed executable must be the already-approved root-owned Node chain;
never substitute the Homebrew Node used for offline tests. Use a private,
standalone frozen Git release checkout of the reviewed candidate, with no
auto-pull or runtime remote update. The helpers bind receipts to Git HEAD.
Pin package.json, all three scripts, infra/autohunter.production.json, exact
Git HEAD/ref metadata and the required executables according to the installed
profile's closure rules. Do not run credentials from this development worktree.
`integrity.sha256` enumerates this reviewed source payload; it does not pin the
future operator-installed CA, executable chain, Git metadata or profile itself.
The operator must pin those separately. In particular, `node --run` invokes a
shell and these preserved helpers call tools by name: use the installed profile's
fixed positive PATH/environment and validate the entire effective tool closure,
including nested Node, Git, Bash, SSH and PostgreSQL tools. Do not treat the
outer `/usr/local/bin/node` path alone as sufficient runtime qualification.
If a frozen Git release cannot meet the installed profile validation, stop and
review a fixed installed-source identity adaptation instead of weakening it.

## Public/static inputs and unresolved choices

Known source identity is `vbnowzvaoyilhylrowku`; its direct database hostname
is `db.vbnowzvaoyilhylrowku.supabase.co`. The manifest denies another source.
Do not assume the application login can export Auth or act as the backup role.

| Field | Value or required owner resolution |
| --- | --- |
| `AUTOHUNTER_INFRASTRUCTURE_CONTRACT` | Exact installed infra/autohunter.production.json path/hash |
| `AUTOHUNTER_BACKUP_SOURCE_ID` | `vbnowzvaoyilhylrowku` |
| `AUTOHUNTER_BACKUP_CREDENTIAL_SOURCE` | `broker-env` for the trusted-profile path |
| `AUTOHUNTER_BACKUP_BROKER_APPROVED` | Fixed `1` in the reviewed profile; not caller override |
| `AUTOHUNTER_BACKUP_DB_PASSWORD` | Opaque mapping from an operator-selected existing approved credential field; reference unknown and intentionally not guessed |
| DB host/port/user/name | Operator selects direct or session pooler and a read-capable role covering catcht/auth/public; exact source ref must still match |
| CA path/SHA256 | Review authenticated provider CA, install existing fixed file and pin it; verify-full is mandatory |
| SSH gateway | Existing Proxmox gateway is the documented candidate; prove its exact host-key/tool/crypt contract before accepting |
| Crypt remote/prefix | Reuse approved encrypted B2 convention; select a disjoint AutoHunter prefix and confirm create/read-only access and retention; no delete/prune authority |
| Receipt directory | Fixed private directory, mode0700; row-free receipts mode0600 |
| PostgreSQL tools | Major17 locally and on gateway; select/pin actual executable identities; do not relax version gates or silently alter profile runtime controls |
| Restore credential | Separately approved isolated-destination credential; never a production profile reused as a restore target |
| Drill target | Not any production project ref; DB name must be `autohunter_restore_<target-id-with-underscores>` and selected schemas must be absent |

The exact additional backup variable names are
`AUTOHUNTER_BACKUP_DB_HOST`, `AUTOHUNTER_BACKUP_DB_PORT`,
`AUTOHUNTER_BACKUP_DB_USER`, `AUTOHUNTER_BACKUP_DB_NAME`,
`AUTOHUNTER_BACKUP_DB_SSLROOTCERT`, `AUTOHUNTER_BACKUP_DB_SSLROOTCERT_SHA256`,
`AUTOHUNTER_BACKUP_SSH_HOST`, `AUTOHUNTER_BACKUP_SSH_PORT`,
`AUTOHUNTER_BACKUP_RCLONE_REMOTE`, `AUTOHUNTER_BACKUP_RCLONE_PATH_PREFIX`, and
`AUTOHUNTER_BACKUP_RECEIPT_DIR`. Timeout defaults to 15 seconds; TLS is always
verify-full. Pin static values rather than forwarding caller environment.

Restore uses separate `AUTOHUNTER_RESTORE_DRILL_TARGET_ID`,
`AUTOHUNTER_RESTORE_DB_HOST`, `AUTOHUNTER_RESTORE_DB_PORT`,
`AUTOHUNTER_RESTORE_DB_USER`, `AUTOHUNTER_RESTORE_DB_NAME`,
`AUTOHUNTER_RESTORE_DB_SSLROOTCERT`, `AUTOHUNTER_RESTORE_DB_SSLROOTCERT_SHA256`,
`AUTOHUNTER_RESTORE_RECEIPT_DIR`, `AUTOHUNTER_RESTORE_CREDENTIAL_SOURCE=broker-env`,
`AUTOHUNTER_RESTORE_BROKER_APPROVED=1`, and the separately opaque
`AUTOHUNTER_RESTORE_DB_PASSWORD` mapping. It reuses only the fixed gateway,
crypt and infrastructure-contract settings. The approved production source-host
value should also be retained for the same-host refusal check.

Keychain fallback is retained for manual operator continuity only. Agents use
the approved opaque profile path, not model-visible Keychain/password commands.
The production/restore credential references, role, CA, prefix and target are
unresolved material inputs; this candidate must not fabricate them.

## Independent success observation and rollback

The broker's response is deliberately opaque; it does not prove child success.
Separately inspect only the expected private row-free receipt and file mode,
bound source/candidate/manifest/script/CA digests, remote receipt byte readback,
archive SHA/size/TOC and aggregate parity. No receipt means no backup claim.
Only a real isolated restore and application authorization canary qualify
recovery. Do not expose rows, password hashes, connection URLs or credentials.

Failed uploads stay uniquely quarantined; never relabel or overwrite them.
Nothing deletes a B2 object. A failed restore is confined to the exact empty
drill database; preserve its evidence and make any cleanup a separate scoped
operation. Retain old profiles/releases unchanged until independently qualified
replacement. Disabling/removing a candidate profile is separate from deleting
backup artifacts. This candidate does not change PR39, signup containment,
database grants/migrations, user binding, Vercel secrets or production routing.

## Recovery classes outside this archive

This cold archive covers durable auth/public/catcht schema/data, excluding ten
transient Auth table-data classes. It omits PostgreSQL global roles/grants,
Supabase Auth/provider settings, signing/API/SMTP secrets, Storage object bytes,
functions, external integrations, DNS and source repositories. Preserve those
as separately reviewed configuration/role/source/opaque-secret/object exports.
Do not call one portable SQL archive complete application disaster recovery.
