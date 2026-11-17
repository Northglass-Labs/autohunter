#!/usr/bin/env bash

# Create and verify AutoHunter's provider-independent PostgreSQL recovery point.
#
# The database archive never lands on the local filesystem. pg_dump writes a
# PostgreSQL 17 custom archive to stdout, SSH protects it in transit, and an
# existing rclone crypt remote encrypts it before durable storage. Verification
# re-reads the decrypted object on the remote encryption gateway and emits only
# byte counts, digests, and pg_restore TOC metadata.

set -Eeuo pipefail
set +x
IFS=$'\n\t'
umask 077

readonly SCRIPT_VERSION="1.1.0"
readonly REQUIRED_POSTGRES_MAJOR="17"
readonly DEFAULT_KEYCHAIN_SERVICE="AutoHunter PostgreSQL Backup"
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
readonly infrastructure_contract="${AUTOHUNTER_INFRASTRUCTURE_CONTRACT:-${REPO_ROOT}/infra/autohunter.production.json}"

readonly EXCLUDED_TABLE_DATA_ARGS=(
  --exclude-table-data=auth.sessions
  --exclude-table-data=auth.refresh_tokens
  --exclude-table-data=auth.mfa_amr_claims
  --exclude-table-data=auth.flow_state
  --exclude-table-data=auth.one_time_tokens
  --exclude-table-data=auth.mfa_challenges
  --exclude-table-data=auth.audit_log_entries
  --exclude-table-data=auth.saml_relay_states
  --exclude-table-data=auth.oauth_client_states
  --exclude-table-data=auth.webauthn_challenges
)

mode="preflight"
receipt_input=""
confirm_source_id=""
database_password=""
source_aggregate_rows=""
source_snapshot_id=""
snapshot_holder_pid=""
snapshot_control_dir=""
snapshot_active="false"

usage() {
  cat <<'USAGE'
Usage:
  scripts/backup-portable-postgres.sh
  scripts/backup-portable-postgres.sh --execute --confirm-source-id <source-id>
  scripts/backup-portable-postgres.sh --verify-receipt <receipt.json>
  scripts/backup-portable-postgres.sh --list-toc <receipt.json>

Default mode is a non-mutating preflight. It validates PostgreSQL 17 source
access, the SSH gateway, and an existing rclone crypt remote, but creates no
backup.

--execute is the only artifact-creating mode and requires the exact configured
AUTOHUNTER_BACKUP_SOURCE_ID as --confirm-source-id.

--verify-receipt re-reads the encrypted artifact named by a row-free receipt,
then compares its decrypted byte size, SHA-256, and pg_restore TOC fingerprint.

--list-toc safely streams an artifact into `pg_restore --list`. It prints schema
metadata only; it never connects pg_restore to a database and cannot restore.

Required nonsecret environment:
  AUTOHUNTER_BACKUP_SSH_HOST
  AUTOHUNTER_BACKUP_RCLONE_REMOTE
  AUTOHUNTER_BACKUP_RCLONE_PATH_PREFIX

Preflight and execute also require:
  AUTOHUNTER_BACKUP_DB_HOST
  AUTOHUNTER_BACKUP_DB_PORT
  AUTOHUNTER_BACKUP_DB_USER
  AUTOHUNTER_BACKUP_DB_NAME
  AUTOHUNTER_BACKUP_DB_SSLROOTCERT         absolute pinned CA certificate path
  AUTOHUNTER_BACKUP_DB_SSLROOTCERT_SHA256  expected lowercase SHA-256 of CA file
  AUTOHUNTER_BACKUP_SOURCE_ID             exact active project ref from manifest

Optional nonsecret environment:
  AUTOHUNTER_BACKUP_SSH_PORT              default: 22
  AUTOHUNTER_BACKUP_DB_CONNECT_TIMEOUT    default: 15 seconds
  AUTOHUNTER_BACKUP_CREDENTIAL_SOURCE     keychain|broker-env
  AUTOHUNTER_BACKUP_KEYCHAIN_SERVICE      default: AutoHunter PostgreSQL Backup
  AUTOHUNTER_BACKUP_DB_KEYCHAIN_ACCOUNT   default: source ID
  AUTOHUNTER_BACKUP_RECEIPT_DIR           default: user application support
  AUTOHUNTER_INFRASTRUCTURE_CONTRACT      default: repo production manifest

Keychain mode reads the database password from the configured generic-password
item. Broker mode requires AUTOHUNTER_BACKUP_BROKER_APPROVED=1 and reads
AUTOHUNTER_BACKUP_DB_PASSWORD. The password is never accepted as an argument,
placed in a connection URL, written to a receipt, or printed.
USAGE
}

die() {
  printf 'status=failed reason=%s\n' "$1" >&2
  exit 1
}

cleanup() {
  if [[ "$snapshot_active" == "true" ]]; then
    printf 'rollback;\n\\q\n' >&7 2>/dev/null || true
    exec 7>&- 8>&- || true
    if [[ -n "$snapshot_holder_pid" ]]; then
      wait "$snapshot_holder_pid" >/dev/null 2>&1 || true
    fi
  fi
  if [[ -n "$snapshot_control_dir" ]]; then
    rm -f -- "${snapshot_control_dir}/input" "${snapshot_control_dir}/output" \
      >/dev/null 2>&1 || true
    rmdir -- "$snapshot_control_dir" >/dev/null 2>&1 || true
  fi
  database_password=""
  source_aggregate_rows=""
  source_snapshot_id=""
  unset database_password source_aggregate_rows source_snapshot_id PGPASSWORD \
    AUTOHUNTER_BACKUP_DB_PASSWORD
}
trap cleanup EXIT
trap 'die interrupted' HUP INT TERM

require_option_value() {
  [[ $# -ge 2 && -n "$2" ]] || die "missing_option_value"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --execute)
      [[ "$mode" == "preflight" ]] || die "multiple_modes_not_allowed"
      mode="execute"
      shift
      ;;
    --confirm-source-id)
      require_option_value "$@"
      confirm_source_id="$2"
      shift 2
      ;;
    --verify-receipt)
      require_option_value "$@"
      [[ "$mode" == "preflight" ]] || die "multiple_modes_not_allowed"
      mode="verify-receipt"
      receipt_input="$2"
      shift 2
      ;;
    --list-toc)
      require_option_value "$@"
      [[ "$mode" == "preflight" ]] || die "multiple_modes_not_allowed"
      mode="list-toc"
      receipt_input="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "unknown_option"
      ;;
  esac
done

validate_text_label() {
  local value="$1"
  local reason="$2"

  [[ -n "$value" && ${#value} -le 128 ]] || die "$reason"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || die "$reason"
  [[ ! "$value" =~ [[:cntrl:]] ]] || die "$reason"
}

validate_absolute_path() {
  local value="$1"
  local reason="$2"

  [[ -n "$value" && ${#value} -le 1024 ]] || die "$reason"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || die "$reason"
  [[ ! "$value" =~ [[:cntrl:]] ]] || die "$reason"
  [[ "$value" == /* ]] || die "$reason"
  case "/${value#/}/" in
    *"/../"*|*"/./"*) die "$reason" ;;
  esac
}

validate_absolute_path "$infrastructure_contract" "invalid_infrastructure_contract_path"
[[ -f "$infrastructure_contract" && -r "$infrastructure_contract" ]] ||
  die "infrastructure_contract_unavailable"

manifest_project_fields="$(
  node --input-type=module - "$infrastructure_contract" <<'NODE' 2>/dev/null
import { readFileSync } from "node:fs";

const contract = JSON.parse(readFileSync(process.argv[2], "utf8"));
const projectRefPattern = /^[a-z0-9]{20}$/;
const deployment = contract?.deployment ?? {};
const activeProjectRef = deployment.activeProjectRef;
const projectRefs = Object.values(contract?.projects ?? {})
  .map((project) => project?.ref)
  .filter((ref) => ref !== null && ref !== undefined);
const uniqueProjectRefs = [...new Set(projectRefs)];

if (
  !projectRefPattern.test(activeProjectRef ?? "") ||
  uniqueProjectRefs.length < 1 ||
  uniqueProjectRefs.some((ref) => !projectRefPattern.test(ref)) ||
  !uniqueProjectRefs.includes(activeProjectRef)
) {
  process.exit(1);
}

process.stdout.write(`${activeProjectRef}\t${uniqueProjectRefs.join(",")}`);
NODE
)" || die "invalid_infrastructure_contract"

IFS=$'\t' read -r manifest_active_project_ref manifest_known_project_refs \
  <<<"$manifest_project_fields"
[[ "$manifest_active_project_ref" =~ ^[a-z0-9]{20}$ ]] ||
  die "invalid_manifest_active_project_ref"
[[ -n "$manifest_known_project_refs" ]] || die "invalid_manifest_project_inventory"

readonly ssh_host="${AUTOHUNTER_BACKUP_SSH_HOST:-}"
readonly ssh_port="${AUTOHUNTER_BACKUP_SSH_PORT:-22}"
readonly rclone_remote="${AUTOHUNTER_BACKUP_RCLONE_REMOTE:-}"
readonly rclone_path_prefix="${AUTOHUNTER_BACKUP_RCLONE_PATH_PREFIX:-}"

[[ "$ssh_host" =~ ^[A-Za-z0-9_][A-Za-z0-9_.@-]*$ && ${#ssh_host} -le 253 ]] ||
  die "invalid_ssh_host"
[[ "$ssh_port" =~ ^[0-9]+$ && ${#ssh_port} -le 5 &&
  "$ssh_port" -ge 1 && "$ssh_port" -le 65535 ]] ||
  die "invalid_ssh_port"
[[ "$rclone_remote" =~ ^[A-Za-z0-9][A-Za-z0-9_-]*$ && ${#rclone_remote} -le 64 ]] ||
  die "invalid_rclone_remote"
[[ "$rclone_path_prefix" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ &&
  ${#rclone_path_prefix} -le 240 ]] ||
  die "invalid_rclone_path_prefix"
[[ "$rclone_path_prefix" != */ && "$rclone_path_prefix" != *//* ]] ||
  die "invalid_rclone_path_prefix"
case "/$rclone_path_prefix/" in
  *"/../"*|*"/./"*) die "invalid_rclone_path_prefix" ;;
esac

readonly SSH_ARGS=(
  -o BatchMode=yes
  -o ConnectTimeout=15
  -o ForwardAgent=no
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=2
  -o StrictHostKeyChecking=yes
  -p "$ssh_port"
)

for command_name in ssh awk grep sed tr wc date chmod mkdir mkfifo mv rm rmdir node git; do
  command -v "$command_name" >/dev/null 2>&1 || die "missing_${command_name}"
done

remote_pg_restore_major=""

run_remote_preflight() {
  local result=""

  result="$(
    ssh "${SSH_ARGS[@]}" -- "$ssh_host" bash -s -- "$rclone_remote" <<'REMOTE' 2>/dev/null
set -Eeuo pipefail
set +x
IFS=$'\n\t'
remote="$1"

for command_name in rclone pg_restore sha256sum awk wc tr; do
  command -v "$command_name" >/dev/null 2>&1 || exit 40
done

# Consume config locally on the gateway and expose no config values. This is a
# hard gate: the named destination must be an rclone crypt wrapper.
rclone config show "$remote" 2>/dev/null |
  awk '$1 == "type" && $2 == "=" && $3 == "crypt" { found = 1 }
       $1 == "no_data_encryption" && $2 == "=" && tolower($3) == "true" {
         data_encryption_disabled = 1
       }
       END { exit(found && !data_encryption_disabled ? 0 : 1) }' || exit 41

rclone lsf "${remote}:" --max-depth 1 >/dev/null 2>&1 || exit 42

version="$(pg_restore --version 2>/dev/null)"
if [[ "$version" =~ ([0-9]+)\.([0-9]+) ]]; then
  printf 'PG_RESTORE_MAJOR=%s\n' "${BASH_REMATCH[1]}"
else
  exit 43
fi
REMOTE
  )" || die "remote_preflight_failed"

  [[ "$result" =~ ^PG_RESTORE_MAJOR=([0-9]+)$ ]] ||
    die "invalid_remote_preflight_result"
  remote_pg_restore_major="${BASH_REMATCH[1]}"
  [[ "$remote_pg_restore_major" == "$REQUIRED_POSTGRES_MAJOR" ]] ||
    die "remote_pg_restore_major_mismatch"
}

run_remote_preflight

receipt_remote=""
receipt_object_path=""
receipt_version=""
receipt_source_project_ref=""
receipt_remote_object_path=""
receipt_remote_immutable=""
receipt_archive_sha256=""
receipt_archive_bytes=""
receipt_toc_sha256=""
receipt_toc_entries=""
receipt_aggregate_table_count=""
receipt_aggregate_row_count=""
receipt_aggregate_counts_sha256=""
receipt_database_sslrootcert_sha256=""

load_receipt() {
  local receipt_path="$1"
  local fields=""

  validate_absolute_path "$receipt_path" "invalid_receipt_path"
  [[ -f "$receipt_path" && -r "$receipt_path" ]] || die "receipt_unavailable"

  fields="$(
    node --input-type=module - "$receipt_path" <<'NODE' 2>/dev/null
import { readFileSync } from "node:fs";

const path = process.argv[2];
const value = JSON.parse(readFileSync(path, "utf8"));
const validHex = (candidate) => typeof candidate === "string" && /^[a-f0-9]{64}$/.test(candidate);
const validInteger = (candidate) => Number.isSafeInteger(candidate) && candidate >= 0;
const validRemote = (candidate) => typeof candidate === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(candidate);
const validProjectRef = (candidate) => typeof candidate === "string" && /^[a-z0-9]{20}$/.test(candidate);
const validTimestamp = (candidate) => typeof candidate === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(candidate) &&
  Number.isFinite(Date.parse(candidate));
const validPath = (candidate) =>
  typeof candidate === "string" &&
  /^[A-Za-z0-9][A-Za-z0-9._/-]{0,400}$/.test(candidate) &&
  !candidate.includes("//") &&
  !candidate.split("/").some((part) => part === "." || part === "..");

const isLegacyReceipt = value?.receipt_version === 1;
const isImmutableReceipt = value?.receipt_version === 2;
const sourceProjectRef = value?.source_project_ref ?? value?.source_id;
const commonKeys = [
  "receipt_version", "tool_version", "status", "started_at", "completed_at",
  "postgres_server_version_num", "pg_dump_version", "archive_format", "transport",
  "rclone_remote", "object_path", "archive_bytes", "archive_sha256", "toc_entries",
  "toc_sha256", "schemas", "transient_auth_table_data_excluded",
  "artifact_data_class", "receipt_contains_private_rows",
];
const legacyKeys = [...commonKeys, "source_id"];
const immutableKeys = [
  ...commonKeys,
  "source_project_ref", "invocation", "reviewed_git_sha",
  "infrastructure_contract_sha256", "backup_script_sha256", "receipt_object_path",
  "receipt_remote_immutable", "aggregate_table_count", "aggregate_row_count",
  "aggregate_counts_sha256", "database_sslrootcert_sha256",
];
const expectedKeys = (isImmutableReceipt ? immutableKeys : legacyKeys).sort();
const actualKeys = Object.keys(value ?? {}).sort();

if (
  (!isLegacyReceipt && !isImmutableReceipt) ||
  actualKeys.length !== expectedKeys.length ||
  actualKeys.some((key, index) => key !== expectedKeys[index]) ||
  typeof value?.tool_version !== "string" ||
  !/^[A-Za-z0-9._-]{1,64}$/.test(value.tool_version) ||
  !validTimestamp(value?.started_at) ||
  !validTimestamp(value?.completed_at) ||
  Date.parse(value.completed_at) < Date.parse(value.started_at) ||
  !Number.isSafeInteger(value?.postgres_server_version_num) ||
  Math.trunc(value.postgres_server_version_num / 10000) !== 17 ||
  typeof value?.pg_dump_version !== "string" ||
  !/^17\.\d+$/.test(value.pg_dump_version) ||
  !validProjectRef(sourceProjectRef) ||
  value?.archive_format !== "postgresql-custom" ||
  value?.transport !== "ssh+rclone-crypt" ||
  value?.status !== "verified" ||
  value?.artifact_data_class !== "restricted-production" ||
  value?.receipt_contains_private_rows !== false ||
  value?.transient_auth_table_data_excluded !== true ||
  !Array.isArray(value?.schemas) ||
  value.schemas.join(",") !== "auth,public,catcht" ||
  !validRemote(value?.rclone_remote) ||
  !validPath(value?.object_path) ||
  !validHex(value?.archive_sha256) ||
  !validInteger(value?.archive_bytes) ||
  value.archive_bytes < 1 ||
  !validHex(value?.toc_sha256) ||
  !validInteger(value?.toc_entries) ||
  value.toc_entries < 1 ||
  (isImmutableReceipt && (
    !["manual", "scheduled"].includes(value?.invocation) ||
    !validHex(value?.infrastructure_contract_sha256) ||
    !validHex(value?.backup_script_sha256) ||
    typeof value?.reviewed_git_sha !== "string" ||
    !/^[a-f0-9]{40}$/.test(value.reviewed_git_sha) ||
    !validInteger(value?.aggregate_table_count) ||
    value.aggregate_table_count < 1 ||
    !validInteger(value?.aggregate_row_count) ||
    !validHex(value?.aggregate_counts_sha256) ||
    !validHex(value?.database_sslrootcert_sha256) ||
    value?.receipt_remote_immutable !== true ||
    !validPath(value?.receipt_object_path) ||
    value.receipt_object_path === value.object_path
  ))
) {
  process.exit(1);
}

process.stdout.write([
  String(value.receipt_version),
  sourceProjectRef,
  value.rclone_remote,
  value.object_path,
  isImmutableReceipt ? value.receipt_object_path : "-",
  isImmutableReceipt ? "true" : "false",
  value.archive_sha256,
  String(value.archive_bytes),
  value.toc_sha256,
  String(value.toc_entries),
  isImmutableReceipt ? String(value.aggregate_table_count) : "-1",
  isImmutableReceipt ? String(value.aggregate_row_count) : "-1",
  isImmutableReceipt ? value.aggregate_counts_sha256 : "-",
  isImmutableReceipt ? value.database_sslrootcert_sha256 : "-",
].join("\t"));
NODE
  )" || die "invalid_receipt"

  IFS=$'\t' read -r \
    receipt_version \
    receipt_source_project_ref \
    receipt_remote \
    receipt_object_path \
    receipt_remote_object_path \
    receipt_remote_immutable \
    receipt_archive_sha256 \
    receipt_archive_bytes \
    receipt_toc_sha256 \
    receipt_toc_entries \
    receipt_aggregate_table_count \
    receipt_aggregate_row_count \
    receipt_aggregate_counts_sha256 \
    receipt_database_sslrootcert_sha256 <<<"$fields"

  [[ "$receipt_remote" == "$rclone_remote" ]] ||
    die "receipt_remote_mismatch"

  local project_ref=""
  local declared="false"
  local known_project_refs=()
  IFS=',' read -r -a known_project_refs <<<"$manifest_known_project_refs"
  for project_ref in "${known_project_refs[@]}"; do
    if [[ "$receipt_source_project_ref" == "$project_ref" ]]; then
      declared="true"
      break
    fi
  done
  [[ "$declared" == "true" ]] || die "receipt_source_project_ref_not_declared"
}

local_file_sha256() {
  local path="$1"

  node --input-type=module - "$path" <<'NODE' 2>/dev/null
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

process.stdout.write(createHash("sha256").update(readFileSync(process.argv[2])).digest("hex"));
NODE
}

verify_remote_receipt() {
  local remote_receipt_path="$1"
  local local_receipt_path="$2"
  local expected_sha256=""
  local result=""

  expected_sha256="$(local_file_sha256 "$local_receipt_path")" ||
    die "local_receipt_digest_failed"
  [[ "$expected_sha256" =~ ^[a-f0-9]{64}$ ]] ||
    die "invalid_local_receipt_digest"

  result="$(
    ssh "${SSH_ARGS[@]}" -- "$ssh_host" bash -s -- \
      "$rclone_remote" "$remote_receipt_path" "$expected_sha256" <<'REMOTE' 2>/dev/null
set -Eeuo pipefail
set +x
remote="$1"
receipt_path="$2"
expected_sha256="$3"

actual_sha256="$(
  rclone cat "${remote}:${receipt_path}" 2>/dev/null |
    sha256sum |
    awk '{ print $1 }'
)"
[[ "$actual_sha256" == "$expected_sha256" ]]
printf 'REMOTE_RECEIPT_SHA256=%s\n' "$actual_sha256"
REMOTE
  )" || die "remote_receipt_verification_failed"

  [[ "$result" == "REMOTE_RECEIPT_SHA256=${expected_sha256}" ]] ||
    die "remote_receipt_verification_failed"
}

archive_sha256=""
archive_bytes=""
toc_sha256=""
toc_entries=""

remote_archive_metadata() {
  local object_path="$1"

  ssh "${SSH_ARGS[@]}" -- "$ssh_host" bash -s -- \
    "$rclone_remote" "$object_path" <<'REMOTE' 2>/dev/null
set -Eeuo pipefail
set +x
IFS=$'\n\t'
remote="$1"
object_path="$2"
artifact="${remote}:${object_path}"

rclone cat "$artifact" --head 1 >/dev/null 2>&1

# pg_restore may stop reading as soon as its archive directory is complete,
# which gives the upstream rclone process SIGPIPE (141) even though the archive
# parsed successfully. Accept only that expected producer-side status; every
# other rclone failure and every downstream parser/digest failure still trips
# pipefail.
stream_remote_archive() {
  local archive_stream_status=0
  rclone cat "$artifact" 2>/dev/null || archive_stream_status=$?
  [[ "$archive_stream_status" -eq 0 || "$archive_stream_status" -eq 141 ]]
}

archive_sha="$(
  stream_remote_archive |
    sha256sum |
    awk '{ print $1 }'
)"
archive_byte_count="$(
  stream_remote_archive |
    wc -c |
    tr -d '[:space:]'
)"
toc_sha="$(
  stream_remote_archive |
    pg_restore --list 2>/dev/null |
    sha256sum |
    awk '{ print $1 }'
)"
toc_entry_count="$(
  stream_remote_archive |
    pg_restore --list 2>/dev/null |
    awk '!/^;/ && NF { count += 1 } END { print count + 0 }'
)"

[[ "$archive_sha" =~ ^[a-f0-9]+$ && ${#archive_sha} -eq 64 ]]
[[ "$archive_byte_count" =~ ^[0-9]+$ && "$archive_byte_count" -gt 0 ]]
[[ "$toc_sha" =~ ^[a-f0-9]+$ && ${#toc_sha} -eq 64 ]]
[[ "$toc_entry_count" =~ ^[0-9]+$ && "$toc_entry_count" -gt 0 ]]

printf 'ARCHIVE_SHA256=%s\n' "$archive_sha"
printf 'ARCHIVE_BYTES=%s\n' "$archive_byte_count"
printf 'TOC_SHA256=%s\n' "$toc_sha"
printf 'TOC_ENTRIES=%s\n' "$toc_entry_count"
REMOTE
}

read_remote_archive_metadata() {
  local object_path="$1"
  local result=""
  local key=""
  local value=""

  result="$(remote_archive_metadata "$object_path")" ||
    die "remote_archive_verification_failed"

  archive_sha256=""
  archive_bytes=""
  toc_sha256=""
  toc_entries=""

  while IFS='=' read -r key value; do
    case "$key" in
      ARCHIVE_SHA256) archive_sha256="$value" ;;
      ARCHIVE_BYTES) archive_bytes="$value" ;;
      TOC_SHA256) toc_sha256="$value" ;;
      TOC_ENTRIES) toc_entries="$value" ;;
      *) die "unexpected_remote_archive_metadata" ;;
    esac
  done <<<"$result"

  [[ "$archive_sha256" =~ ^[a-f0-9]+$ && ${#archive_sha256} -eq 64 ]] ||
    die "invalid_archive_sha256"
  [[ "$archive_bytes" =~ ^[0-9]+$ && "$archive_bytes" -gt 0 ]] ||
    die "invalid_archive_byte_size"
  [[ "$toc_sha256" =~ ^[a-f0-9]+$ && ${#toc_sha256} -eq 64 ]] ||
    die "invalid_toc_sha256"
  [[ "$toc_entries" =~ ^[0-9]+$ && "$toc_entries" -gt 0 ]] ||
    die "invalid_toc_entry_count"
}

if [[ "$mode" == "verify-receipt" || "$mode" == "list-toc" ]]; then
  load_receipt "$receipt_input"

  if [[ "$receipt_remote_immutable" == "true" ]]; then
    verify_remote_receipt "$receipt_remote_object_path" "$receipt_input"
  fi

  if [[ "$mode" == "verify-receipt" ]]; then
    read_remote_archive_metadata "$receipt_object_path"
    [[ "$archive_sha256" == "$receipt_archive_sha256" ]] ||
      die "archive_sha256_mismatch"
    [[ "$archive_bytes" == "$receipt_archive_bytes" ]] ||
      die "archive_byte_size_mismatch"
    [[ "$toc_sha256" == "$receipt_toc_sha256" ]] ||
      die "toc_sha256_mismatch"
    [[ "$toc_entries" == "$receipt_toc_entries" ]] ||
      die "toc_entry_count_mismatch"
    printf 'status=verified receipt=%s\n' "$receipt_input"
    exit 0
  fi

  # This is intentionally the strongest available "restore verification"
  # without a destination database. It prints only the pg_restore TOC and has
  # no --dbname argument, so no restore can occur.
  ssh "${SSH_ARGS[@]}" -- "$ssh_host" bash -s -- \
    "$rclone_remote" "$receipt_object_path" <<'REMOTE'
set -Eeuo pipefail
set +x
remote="$1"
object_path="$2"
# Match the metadata path: pg_restore can finish the TOC before rclone has
# emitted the whole archive. Only producer SIGPIPE is an acceptable early end.
stream_remote_archive() {
  local archive_stream_status=0
  rclone cat "${remote}:${object_path}" 2>/dev/null || archive_stream_status=$?
  [[ "$archive_stream_status" -eq 0 || "$archive_stream_status" -eq 141 ]]
}
stream_remote_archive | pg_restore --list
REMOTE
  exit 0
fi

readonly database_host="${AUTOHUNTER_BACKUP_DB_HOST:-}"
readonly database_port="${AUTOHUNTER_BACKUP_DB_PORT:-}"
readonly database_user="${AUTOHUNTER_BACKUP_DB_USER:-}"
readonly database_name="${AUTOHUNTER_BACKUP_DB_NAME:-}"
readonly database_sslmode="verify-full"
readonly database_sslrootcert="${AUTOHUNTER_BACKUP_DB_SSLROOTCERT:-}"
readonly database_sslrootcert_sha256="${AUTOHUNTER_BACKUP_DB_SSLROOTCERT_SHA256:-}"
readonly database_connect_timeout="${AUTOHUNTER_BACKUP_DB_CONNECT_TIMEOUT:-15}"
readonly source_id="${AUTOHUNTER_BACKUP_SOURCE_ID:-}"
readonly invocation="${AUTOHUNTER_BACKUP_INVOCATION:-manual}"
readonly credential_source="${AUTOHUNTER_BACKUP_CREDENTIAL_SOURCE:-keychain}"
readonly keychain_service="${AUTOHUNTER_BACKUP_KEYCHAIN_SERVICE:-$DEFAULT_KEYCHAIN_SERVICE}"
readonly keychain_account="${AUTOHUNTER_BACKUP_DB_KEYCHAIN_ACCOUNT:-$source_id}"

[[ "$database_host" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ &&
  ${#database_host} -le 253 ]] ||
  die "invalid_database_host"
[[ "$database_port" =~ ^[0-9]+$ && ${#database_port} -le 5 &&
  "$database_port" -ge 1 && "$database_port" -le 65535 ]] ||
  die "invalid_database_port"
[[ "$database_user" =~ ^[A-Za-z_][A-Za-z0-9_.-]*$ &&
  ${#database_user} -le 128 ]] ||
  die "invalid_database_user"
[[ "$database_name" =~ ^[A-Za-z_][A-Za-z0-9_.-]*$ &&
  ${#database_name} -le 128 ]] ||
  die "invalid_database_name"
[[ -z "${AUTOHUNTER_BACKUP_DB_SSLMODE:-}" ||
  "${AUTOHUNTER_BACKUP_DB_SSLMODE}" == "$database_sslmode" ]] ||
  die "invalid_database_sslmode"
validate_absolute_path "$database_sslrootcert" "invalid_database_ssl_root_certificate_path"
[[ -f "$database_sslrootcert" && -r "$database_sslrootcert" ]] ||
  die "database_ssl_root_certificate_unavailable"
[[ "$database_sslrootcert_sha256" =~ ^[a-f0-9]{64}$ ]] ||
  die "invalid_database_ssl_root_certificate_digest"
actual_database_sslrootcert_sha256="$(local_file_sha256 "$database_sslrootcert")" ||
  die "database_ssl_root_certificate_digest_unavailable"
[[ "$actual_database_sslrootcert_sha256" == "$database_sslrootcert_sha256" ]] ||
  die "database_ssl_root_certificate_digest_mismatch"
[[ "$database_connect_timeout" =~ ^[0-9]+$ && ${#database_connect_timeout} -le 2 &&
  "$database_connect_timeout" -ge 1 && "$database_connect_timeout" -le 60 ]] ||
  die "invalid_database_connect_timeout"
[[ "$source_id" =~ ^[a-z0-9]{20}$ ]] || die "invalid_source_project_ref"
[[ "$source_id" == "$manifest_active_project_ref" ]] ||
  die "source_project_ref_not_active"

# Supabase direct endpoints carry the ref in the host; shared poolers carry it
# in the username. Require one exact binding so a valid password cannot silently
# dump a different project than the reviewed production manifest.
if [[ "$database_host" == *.supabase.co || "$database_host" == *.supabase.com ]]; then
  if [[ "$database_host" != "db.${source_id}.supabase.co" &&
    "$database_user" != "postgres.${source_id}" ]]; then
    die "source_endpoint_project_ref_unproven"
  fi
fi
validate_text_label "$keychain_service" "invalid_keychain_service"
validate_text_label "$keychain_account" "invalid_keychain_account"
case "$invocation" in
  manual|scheduled) ;;
  *) die "invalid_backup_invocation" ;;
esac

case "$credential_source" in
  keychain|broker-env) ;;
  *) die "invalid_credential_source" ;;
esac

for command_name in pg_dump psql; do
  command -v "$command_name" >/dev/null 2>&1 || die "missing_${command_name}"
done
if [[ "$credential_source" == "keychain" ]]; then
  command -v security >/dev/null 2>&1 || die "macos_keychain_unavailable"
fi

load_database_password() {
  local value=""

  if [[ "$credential_source" == "keychain" ]]; then
    value="$(
      security find-generic-password \
        -s "$keychain_service" \
        -a "$keychain_account" \
        -w 2>/dev/null
    )" || die "database_credential_unavailable"
  else
    [[ "${AUTOHUNTER_BACKUP_BROKER_APPROVED:-}" == "1" ]] ||
      die "broker_approval_marker_missing"
    value="${AUTOHUNTER_BACKUP_DB_PASSWORD:-}"
  fi

  [[ -n "$value" ]] || die "database_credential_empty"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] ||
    die "database_credential_invalid"
  database_password="$value"
  value=""
  unset AUTOHUNTER_BACKUP_DB_PASSWORD
}

load_database_password

local_pg_dump_version="$(pg_dump --version 2>/dev/null)" ||
  die "pg_dump_version_unavailable"
if [[ "$local_pg_dump_version" =~ ([0-9]+)\.([0-9]+) ]]; then
  local_pg_dump_major="${BASH_REMATCH[1]}"
  local_pg_dump_short_version="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}"
else
  die "invalid_pg_dump_version"
fi
[[ "$local_pg_dump_major" == "$REQUIRED_POSTGRES_MAJOR" ]] ||
  die "local_pg_dump_major_mismatch"

manifest_sha256="$(local_file_sha256 "$infrastructure_contract")" ||
  die "infrastructure_contract_digest_failed"
script_sha256="$(local_file_sha256 "${SCRIPT_DIR}/backup-portable-postgres.sh")" ||
  die "backup_script_digest_failed"
reviewed_git_sha="$(git -C "$REPO_ROOT" rev-parse --verify HEAD 2>/dev/null)" ||
  die "reviewed_git_sha_unavailable"
[[ "$manifest_sha256" =~ ^[a-f0-9]{64}$ ]] || die "invalid_infrastructure_contract_digest"
[[ "$script_sha256" =~ ^[a-f0-9]{64}$ ]] || die "invalid_backup_script_digest"
[[ "$reviewed_git_sha" =~ ^[a-f0-9]{40}$ ]] || die "invalid_reviewed_git_sha"

readonly DB_CONNECTION_ARGS=(
  --host="$database_host"
  --port="$database_port"
  --username="$database_user"
  --dbname="$database_name"
  --no-password
)

source_server_version_num="$(
  PGPASSWORD="$database_password" \
  PGSSLMODE="$database_sslmode" \
  PGSSLROOTCERT="$database_sslrootcert" \
  PGCONNECT_TIMEOUT="$database_connect_timeout" \
  PGAPPNAME=autohunter-portable-backup-preflight \
    psql "${DB_CONNECTION_ARGS[@]}" \
      --no-psqlrc --no-align --tuples-only --quiet \
      --set=ON_ERROR_STOP=1 \
      --command="select current_setting('server_version_num');" 2>/dev/null
)" || die "database_preflight_query_failed"

[[ "$source_server_version_num" =~ ^[0-9]+$ ]] ||
  die "invalid_source_server_version"
source_server_major=$((source_server_version_num / 10000))
[[ "$source_server_major" == "$REQUIRED_POSTGRES_MAJOR" ]] ||
  die "source_server_major_mismatch"

read_source_aggregate_inventory() {
  local snapshot="${1:-}"
  local psql_variable_args=(--set=ON_ERROR_STOP=1)

  if [[ -n "$snapshot" ]]; then
    psql_variable_args+=(--set="source_snapshot=${snapshot}")
  fi

  # Transient Auth tables are represented as zero because pg_dump excludes
  # their data. A supplied exported snapshot makes these counts describe the
  # exact same MVCC view as the custom archive.
  source_aggregate_rows="$(
    PGPASSWORD="$database_password" \
    PGSSLMODE="$database_sslmode" \
    PGSSLROOTCERT="$database_sslrootcert" \
    PGCONNECT_TIMEOUT="$database_connect_timeout" \
    PGAPPNAME=autohunter-portable-backup-inventory \
      psql "${DB_CONNECTION_ARGS[@]}" \
        --no-psqlrc --no-align --tuples-only --quiet \
        --field-separator=$'\t' "${psql_variable_args[@]}" 2>/dev/null <<'SQL'
begin isolation level repeatable read read only;
\if :{?source_snapshot}
set transaction snapshot :'source_snapshot';
\endif
create temporary table autohunter_backup_counts (
  schema_name text not null,
  table_name text not null,
  row_count bigint not null
) on commit drop;
do $autohunter$
declare
  relation record;
  exact_count bigint;
begin
  for relation in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('auth', 'public', 'catcht') and c.relkind in ('r', 'p')
    order by n.nspname, c.relname
  loop
    if relation.schema_name = 'auth' and relation.table_name in (
      'sessions', 'refresh_tokens', 'mfa_amr_claims', 'flow_state',
      'one_time_tokens', 'mfa_challenges', 'audit_log_entries',
      'saml_relay_states', 'oauth_client_states', 'webauthn_challenges'
    ) then
      exact_count := 0;
    else
      execute format('select count(*) from %I.%I', relation.schema_name, relation.table_name)
        into exact_count;
    end if;
    insert into autohunter_backup_counts values (
      relation.schema_name, relation.table_name, exact_count
    );
  end loop;
end
$autohunter$;
select schema_name, table_name, row_count
from autohunter_backup_counts
order by schema_name, table_name;
rollback;
SQL
  )" || die "source_aggregate_inventory_failed"

  aggregate_table_count=0
  aggregate_row_count=0
  while IFS=$'\t' read -r aggregate_schema aggregate_table aggregate_count; do
    [[ "$aggregate_schema" =~ ^(auth|public|catcht)$ &&
      "$aggregate_table" =~ ^[A-Za-z_][A-Za-z0-9_]*$ && "$aggregate_count" =~ ^[0-9]+$ ]] ||
      die "invalid_source_aggregate_inventory"
    aggregate_table_count=$((aggregate_table_count + 1))
    aggregate_row_count=$((aggregate_row_count + aggregate_count))
  done <<<"$source_aggregate_rows"
  [[ "$aggregate_table_count" -gt 0 ]] || die "source_aggregate_inventory_empty"
  aggregate_counts_sha256="$(
    printf '%s\n' "$source_aggregate_rows" |
      node --input-type=module -e '
        import { createHash } from "node:crypto";
        const chunks = [];
        for await (const chunk of process.stdin) chunks.push(chunk);
        process.stdout.write(createHash("sha256").update(Buffer.concat(chunks)).digest("hex"));
      '
  )" || die "source_aggregate_digest_failed"
  [[ "$aggregate_counts_sha256" =~ ^[a-f0-9]{64}$ ]] ||
    die "invalid_source_aggregate_digest"
}

# Preflight proves count permissions without retaining the snapshot. Execute
# repeats this inside the exported pg_dump snapshot below.
read_source_aggregate_inventory

# A schema-only custom archive sent to /dev/null verifies source permissions,
# schema selection, archive creation, and connection settings without creating
# a local artifact or exposing SQL.
PGPASSWORD="$database_password" \
PGSSLMODE="$database_sslmode" \
PGSSLROOTCERT="$database_sslrootcert" \
PGCONNECT_TIMEOUT="$database_connect_timeout" \
PGAPPNAME=autohunter-portable-backup-preflight \
  pg_dump "${DB_CONNECTION_ARGS[@]}" \
    --format=custom \
    --schema-only \
    --schema=auth \
    --schema=public \
    --schema=catcht \
    --strict-names \
    --no-owner \
    --no-privileges \
    --no-publications \
    --no-subscriptions \
    --no-tablespaces \
    --no-table-access-method \
    --compress=zstd:6 \
    >/dev/null 2>/dev/null || die "schema_archive_preflight_failed"

if [[ "$mode" == "preflight" ]]; then
  printf 'Preflight complete; no backup was created.\n'
  printf 'status=ready postgres_major=%s remote_archive_reader_major=%s\n' \
    "$source_server_major" "$remote_pg_restore_major"
  exit 0
fi

[[ "$confirm_source_id" == "$source_id" ]] ||
  die "source_confirmation_mismatch"

default_receipt_dir=""
if [[ -n "${HOME:-}" ]]; then
  default_receipt_dir="${HOME}/Library/Application Support/AutoHunter/backup-receipts"
fi
readonly receipt_dir="${AUTOHUNTER_BACKUP_RECEIPT_DIR:-$default_receipt_dir}"
validate_absolute_path "$receipt_dir" "invalid_receipt_directory"
mkdir -p "$receipt_dir" || die "receipt_directory_create_failed"
chmod 700 "$receipt_dir" || die "receipt_directory_permission_failed"

start_source_snapshot() {
  snapshot_control_dir="${receipt_dir}/.snapshot-${source_id}-$$"
  [[ ! -e "$snapshot_control_dir" ]] || die "snapshot_control_already_exists"
  mkdir "$snapshot_control_dir" || die "snapshot_control_create_failed"
  chmod 700 "$snapshot_control_dir" || die "snapshot_control_permission_failed"
  mkfifo "${snapshot_control_dir}/input" "${snapshot_control_dir}/output" ||
    die "snapshot_control_fifo_failed"
  chmod 600 "${snapshot_control_dir}/input" "${snapshot_control_dir}/output" ||
    die "snapshot_control_permission_failed"

  exec 7<>"${snapshot_control_dir}/input"
  exec 8<>"${snapshot_control_dir}/output"
  PGPASSWORD="$database_password" \
  PGSSLMODE="$database_sslmode" \
  PGSSLROOTCERT="$database_sslrootcert" \
  PGCONNECT_TIMEOUT="$database_connect_timeout" \
  PGAPPNAME=autohunter-portable-backup-snapshot-holder \
    psql "${DB_CONNECTION_ARGS[@]}" --no-psqlrc --no-align --tuples-only --quiet \
      --set=ON_ERROR_STOP=1 <&7 >&8 2>/dev/null &
  snapshot_holder_pid="$!"
  snapshot_active="true"

  printf '%s\n' \
    'begin isolation level repeatable read read only;' \
    "select pg_export_snapshot();" >&7 || die "source_snapshot_request_failed"
  IFS= read -r source_snapshot_id <&8 || die "source_snapshot_export_failed"
  [[ "$source_snapshot_id" =~ ^[A-Fa-f0-9-]{5,128}$ ]] ||
    die "invalid_source_snapshot_id"
  kill -0 "$snapshot_holder_pid" >/dev/null 2>&1 || die "source_snapshot_holder_exited"
}

stop_source_snapshot() {
  [[ "$snapshot_active" == "true" ]] || return 0
  printf 'rollback;\n\\q\n' >&7 || die "source_snapshot_release_failed"
  exec 7>&- 8>&-
  wait "$snapshot_holder_pid" || die "source_snapshot_holder_failed"
  snapshot_active="false"
  snapshot_holder_pid=""
  rm -f -- "${snapshot_control_dir}/input" "${snapshot_control_dir}/output" ||
    die "snapshot_control_cleanup_failed"
  rmdir -- "$snapshot_control_dir" || die "snapshot_control_cleanup_failed"
  snapshot_control_dir=""
}

backup_started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
timestamp_compact="$(date -u +%Y%m%dT%H%M%SZ)"
date_path="$(date -u +%Y/%m/%d)"
[[ "$backup_started_at" =~ ^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]Z$ ]] ||
  die "invalid_backup_timestamp"
[[ "$timestamp_compact" =~ ^[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z$ ]] ||
  die "invalid_backup_timestamp"
[[ "$date_path" =~ ^[0-9][0-9][0-9][0-9]/[0-9][0-9]/[0-9][0-9]$ ]] ||
  die "invalid_backup_date_path"

object_path="${rclone_path_prefix}/${date_path}/autohunter-${source_id}-${timestamp_compact}-$$.pgc"
[[ "$object_path" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ && ${#object_path} -le 401 ]] ||
  die "invalid_object_path"
object_dir="${object_path%/*}"
object_name="${object_path##*/}"
remote_receipt_object_path="${object_path%.pgc}.receipt.json"
remote_receipt_object_dir="${remote_receipt_object_path%/*}"
remote_receipt_object_name="${remote_receipt_object_path##*/}"
[[ "$remote_receipt_object_path" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ &&
  ${#remote_receipt_object_path} -le 420 ]] || die "invalid_remote_receipt_object_path"

if ssh "${SSH_ARGS[@]}" -- "$ssh_host" \
  "rclone lsf '${rclone_remote}:${object_dir}' --files-only --max-depth 1 --include '/${object_name}' 2>/dev/null | grep -Fx -- '${object_name}'" \
  >/dev/null 2>&1; then
  die "backup_object_already_exists"
fi

if ssh "${SSH_ARGS[@]}" -- "$ssh_host" \
  "rclone lsf '${rclone_remote}:${remote_receipt_object_dir}' --files-only --max-depth 1 --include '/${remote_receipt_object_name}' 2>/dev/null | grep -Fx -- '${remote_receipt_object_name}'" \
  >/dev/null 2>&1; then
  die "receipt_object_already_exists"
fi

start_source_snapshot
read_source_aggregate_inventory "$source_snapshot_id"

readonly DUMP_ARGS=(
  --format=custom
  --compress=zstd:6
  --schema=auth
  --schema=public
  --schema=catcht
  --strict-names
  --no-owner
  --no-privileges
  --no-publications
  --no-subscriptions
  --no-tablespaces
  --no-table-access-method
  --no-security-labels
  "${EXCLUDED_TABLE_DATA_ARGS[@]}"
)

# No --file is allowed here. Pipe failure from pg_dump, SSH, or rclone aborts
# execute mode before a receipt exists.
if ! (
  PGPASSWORD="$database_password" \
  PGSSLMODE="$database_sslmode" \
  PGSSLROOTCERT="$database_sslrootcert" \
  PGCONNECT_TIMEOUT="$database_connect_timeout" \
  PGAPPNAME=autohunter-portable-backup \
    pg_dump "${DB_CONNECTION_ARGS[@]}" "${DUMP_ARGS[@]}" \
      --snapshot="$source_snapshot_id" 2>/dev/null |
    ssh "${SSH_ARGS[@]}" -- "$ssh_host" \
      "exec rclone rcat '${rclone_remote}:${object_path}' --immutable" \
      >/dev/null 2>/dev/null
); then
  die "archive_stream_failed"
fi
stop_source_snapshot

read_remote_archive_metadata "$object_path"
backup_completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
[[ "$backup_completed_at" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] ||
  die "invalid_completion_timestamp"

receipt_path="${receipt_dir}/autohunter-${source_id}-${timestamp_compact}-$$.json"
[[ ! -e "$receipt_path" ]] || die "receipt_already_exists"
pending_receipt_path="${receipt_path}.pending"
[[ ! -e "$pending_receipt_path" ]] || die "pending_receipt_already_exists"

(
  set -o noclobber
  printf '%s\n' "{
  \"receipt_version\": 2,
  \"tool_version\": \"${SCRIPT_VERSION}\",
  \"status\": \"verified\",
  \"source_project_ref\": \"${source_id}\",
  \"invocation\": \"${invocation}\",
  \"reviewed_git_sha\": \"${reviewed_git_sha}\",
  \"infrastructure_contract_sha256\": \"${manifest_sha256}\",
  \"backup_script_sha256\": \"${script_sha256}\",
  \"started_at\": \"${backup_started_at}\",
  \"completed_at\": \"${backup_completed_at}\",
  \"postgres_server_version_num\": ${source_server_version_num},
  \"pg_dump_version\": \"${local_pg_dump_short_version}\",
  \"archive_format\": \"postgresql-custom\",
  \"transport\": \"ssh+rclone-crypt\",
  \"rclone_remote\": \"${rclone_remote}\",
  \"object_path\": \"${object_path}\",
  \"receipt_object_path\": \"${remote_receipt_object_path}\",
  \"receipt_remote_immutable\": true,
  \"archive_bytes\": ${archive_bytes},
  \"archive_sha256\": \"${archive_sha256}\",
  \"toc_entries\": ${toc_entries},
  \"toc_sha256\": \"${toc_sha256}\",
  \"aggregate_table_count\": ${aggregate_table_count},
  \"aggregate_row_count\": ${aggregate_row_count},
  \"aggregate_counts_sha256\": \"${aggregate_counts_sha256}\",
  \"database_sslrootcert_sha256\": \"${database_sslrootcert_sha256}\",
  \"schemas\": [\"auth\", \"public\", \"catcht\"],
  \"transient_auth_table_data_excluded\": true,
  \"artifact_data_class\": \"restricted-production\",
  \"receipt_contains_private_rows\": false
}" >"$pending_receipt_path"
) || die "receipt_write_failed"

chmod 600 "$pending_receipt_path" || die "receipt_permission_failed"
if ! ssh "${SSH_ARGS[@]}" -- "$ssh_host" \
  "exec rclone rcat '${rclone_remote}:${remote_receipt_object_path}' --immutable" \
  <"$pending_receipt_path" >/dev/null 2>/dev/null; then
  die "remote_receipt_upload_failed"
fi
verify_remote_receipt "$remote_receipt_object_path" "$pending_receipt_path"
mv "$pending_receipt_path" "$receipt_path" || die "receipt_finalize_failed"
chmod 600 "$receipt_path" || die "receipt_permission_failed"
printf 'status=complete receipt=%s\n' "$receipt_path"
