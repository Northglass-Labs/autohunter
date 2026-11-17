#!/usr/bin/env bash

# Restore a verified AutoHunter custom archive into a dedicated, empty
# PostgreSQL 17 database and emit row-free verification evidence. This script
# cannot target a database named like production and never installs routing,
# schedules, provider credentials, or hosted-service configuration.

set -Eeuo pipefail
set +x
IFS=$'\n\t'
umask 077

readonly SCRIPT_VERSION="1.1.0"
readonly REQUIRED_POSTGRES_MAJOR="17"
readonly DEFAULT_KEYCHAIN_SERVICE="AutoHunter PostgreSQL Restore Drill"
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
readonly BACKUP_SCRIPT="${SCRIPT_DIR}/backup-portable-postgres.sh"
readonly infrastructure_contract="${AUTOHUNTER_INFRASTRUCTURE_CONTRACT:-${REPO_ROOT}/infra/autohunter.production.json}"

mode="preflight"
receipt_input=""
confirm_target_id=""
database_password=""
aggregate_rows=""

usage() {
  cat <<'USAGE'
Usage:
  scripts/verify-portable-postgres-restore.sh --receipt <backup-receipt.json>
  scripts/verify-portable-postgres-restore.sh --execute \
    --receipt <backup-receipt.json> --confirm-target-id <target-id>

Default mode is non-mutating. It verifies the immutable backup receipt and
artifact, then proves the destination is a dedicated, empty PostgreSQL 17
database. --execute streams the custom archive into that destination in one
transaction and writes a row-free restore-drill receipt.

The target database name must equal `autohunter_restore_<target-id>` after
hyphens are converted to underscores. The target ID must not equal any project
ref in the production manifest. The auth, public, and catcht schemas must be
absent before execution; prepare a new quarantined database out of band.

Required nonsecret environment:
  AUTOHUNTER_INFRASTRUCTURE_CONTRACT       default: repo production manifest
  AUTOHUNTER_BACKUP_SSH_HOST
  AUTOHUNTER_BACKUP_SSH_PORT               optional; default 22
  AUTOHUNTER_BACKUP_RCLONE_REMOTE
  AUTOHUNTER_BACKUP_RCLONE_PATH_PREFIX
  AUTOHUNTER_RESTORE_DRILL_TARGET_ID
  AUTOHUNTER_RESTORE_DB_HOST
  AUTOHUNTER_RESTORE_DB_PORT
  AUTOHUNTER_RESTORE_DB_USER
  AUTOHUNTER_RESTORE_DB_NAME
  AUTOHUNTER_RESTORE_DB_SSLROOTCERT        absolute pinned CA certificate path
  AUTOHUNTER_RESTORE_DB_SSLROOTCERT_SHA256 expected lowercase SHA-256 of CA file
  AUTOHUNTER_RESTORE_DB_CONNECT_TIMEOUT    optional; default 15
  AUTOHUNTER_RESTORE_RECEIPT_DIR            optional absolute path

Credential delivery:
  AUTOHUNTER_RESTORE_CREDENTIAL_SOURCE      keychain (default) or broker-env
  AUTOHUNTER_RESTORE_KEYCHAIN_SERVICE       optional
  AUTOHUNTER_RESTORE_DB_KEYCHAIN_ACCOUNT    optional; default target ID
  AUTOHUNTER_RESTORE_BROKER_APPROVED=1      required for broker-env
  AUTOHUNTER_RESTORE_DB_PASSWORD            injected only for broker-env

The password is never accepted in argv or a URL and is never printed or stored
in either receipt.
USAGE
}

die() {
  printf 'status=failed reason=%s\n' "$1" >&2
  exit 1
}

cleanup() {
  database_password=""
  aggregate_rows=""
  unset database_password aggregate_rows PGPASSWORD AUTOHUNTER_RESTORE_DB_PASSWORD
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
    --receipt)
      require_option_value "$@"
      receipt_input="$2"
      shift 2
      ;;
    --confirm-target-id)
      require_option_value "$@"
      confirm_target_id="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *) die "unknown_option" ;;
  esac
done

validate_absolute_path() {
  local value="$1"
  local reason="$2"

  [[ -n "$value" && ${#value} -le 1024 && "$value" == /* ]] || die "$reason"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || die "$reason"
  [[ ! "$value" =~ [[:cntrl:]] ]] || die "$reason"
  case "/${value#/}/" in
    *"/../"*|*"/./"*) die "$reason" ;;
  esac
}

validate_text_label() {
  local value="$1"
  local reason="$2"
  [[ -n "$value" && ${#value} -le 128 ]] || die "$reason"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || die "$reason"
  [[ ! "$value" =~ [[:cntrl:]] ]] || die "$reason"
}

local_file_sha256() {
  local path="$1"

  node --input-type=module - "$path" <<'NODE' 2>/dev/null
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

process.stdout.write(createHash("sha256").update(readFileSync(process.argv[2])).digest("hex"));
NODE
}

for command_name in node ssh pg_restore psql date chmod mkdir mv git awk wc tr; do
  command -v "$command_name" >/dev/null 2>&1 || die "missing_${command_name}"
done
[[ -x "$BACKUP_SCRIPT" ]] || die "backup_script_unavailable"
validate_absolute_path "$receipt_input" "invalid_receipt_path"
validate_absolute_path "$infrastructure_contract" "invalid_infrastructure_contract_path"
[[ -f "$receipt_input" && -r "$receipt_input" ]] || die "receipt_unavailable"
[[ -f "$infrastructure_contract" && -r "$infrastructure_contract" ]] ||
  die "infrastructure_contract_unavailable"

target_id="${AUTOHUNTER_RESTORE_DRILL_TARGET_ID:-}"
[[ "$target_id" =~ ^[a-z][a-z0-9-]{7,31}$ ]] || die "invalid_restore_target_id"
expected_database_name="autohunter_restore_${target_id//-/_}"
[[ ${#expected_database_name} -le 63 ]] || die "restore_target_database_name_too_long"
if [[ "$mode" == "execute" && "$confirm_target_id" != "$target_id" ]]; then
  die "target_confirmation_mismatch"
fi

manifest_fields="$(
  node --input-type=module - "$infrastructure_contract" <<'NODE' 2>/dev/null
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const raw = readFileSync(process.argv[2]);
const contract = JSON.parse(raw.toString("utf8"));
const refs = [...new Set(Object.values(contract?.projects ?? {})
  .map((project) => project?.ref)
  .filter((ref) => ref !== null && ref !== undefined))];
if (refs.length < 1 || refs.some((ref) => !/^[a-z0-9]{20}$/.test(ref))) process.exit(1);
process.stdout.write(`${refs.join(",")}\t${createHash("sha256").update(raw).digest("hex")}`);
NODE
)" || die "invalid_infrastructure_contract"
IFS=$'\t' read -r manifest_project_refs manifest_sha256 <<<"$manifest_fields"

receipt_fields="$(
  node --input-type=module - "$receipt_input" <<'NODE' 2>/dev/null
import { readFileSync } from "node:fs";

const value = JSON.parse(readFileSync(process.argv[2], "utf8"));
const validHex = (candidate) => typeof candidate === "string" && /^[a-f0-9]{64}$/.test(candidate);
const validInteger = (candidate) => Number.isSafeInteger(candidate) && candidate >= 0;
const validPath = (candidate) =>
  typeof candidate === "string" &&
  /^[A-Za-z0-9][A-Za-z0-9._/-]{0,419}$/.test(candidate) &&
  !candidate.includes("//") &&
  !candidate.split("/").some((part) => part === "." || part === "..");
if (
  value?.receipt_version !== 2 ||
  value?.status !== "verified" ||
  !/^[a-z0-9]{20}$/.test(value?.source_project_ref ?? "") ||
  value?.archive_format !== "postgresql-custom" ||
  value?.transport !== "ssh+rclone-crypt" ||
  value?.receipt_remote_immutable !== true ||
  !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value?.rclone_remote ?? "") ||
  !validPath(value?.object_path) ||
  !validPath(value?.receipt_object_path) ||
  !validHex(value?.archive_sha256) ||
  !validHex(value?.infrastructure_contract_sha256) ||
  !validHex(value?.backup_script_sha256) ||
  !validInteger(value?.aggregate_table_count) ||
  value.aggregate_table_count < 1 ||
  !validInteger(value?.aggregate_row_count) ||
  !validHex(value?.aggregate_counts_sha256) ||
  !validHex(value?.database_sslrootcert_sha256) ||
  !/^[a-f0-9]{40}$/.test(value?.reviewed_git_sha ?? "") ||
  value?.artifact_data_class !== "restricted-production" ||
  value?.receipt_contains_private_rows !== false ||
  value?.transient_auth_table_data_excluded !== true ||
  !Array.isArray(value?.schemas) ||
  value.schemas.join(",") !== "auth,public,catcht"
) process.exit(1);

process.stdout.write([
  value.source_project_ref,
  value.rclone_remote,
  value.object_path,
  value.receipt_object_path,
  value.archive_sha256,
  value.infrastructure_contract_sha256,
  value.reviewed_git_sha,
  String(value.aggregate_table_count),
  String(value.aggregate_row_count),
  value.aggregate_counts_sha256,
  value.database_sslrootcert_sha256,
].join("\t"));
NODE
)" || die "restore_requires_immutable_receipt"
IFS=$'\t' read -r \
  source_project_ref \
  rclone_remote \
  archive_object_path \
  source_receipt_object_path \
  archive_sha256 \
  source_manifest_sha256 \
  source_reviewed_git_sha \
  expected_aggregate_table_count \
  expected_aggregate_row_count \
  expected_aggregate_counts_sha256 \
  source_database_sslrootcert_sha256 <<<"$receipt_fields"

source_declared="false"
target_matches_project="false"
IFS=',' read -r -a known_project_refs <<<"$manifest_project_refs"
for project_ref in "${known_project_refs[@]}"; do
  [[ "$source_project_ref" == "$project_ref" ]] && source_declared="true"
  [[ "$target_id" == "$project_ref" ]] && target_matches_project="true"
done
[[ "$source_declared" == "true" ]] || die "source_project_ref_not_declared"
[[ "$target_matches_project" == "false" ]] || die "target_id_matches_production_project"

database_host="${AUTOHUNTER_RESTORE_DB_HOST:-}"
database_port="${AUTOHUNTER_RESTORE_DB_PORT:-}"
database_user="${AUTOHUNTER_RESTORE_DB_USER:-}"
database_name="${AUTOHUNTER_RESTORE_DB_NAME:-}"
database_sslmode="verify-full"
database_sslrootcert="${AUTOHUNTER_RESTORE_DB_SSLROOTCERT:-}"
database_sslrootcert_sha256="${AUTOHUNTER_RESTORE_DB_SSLROOTCERT_SHA256:-}"
database_connect_timeout="${AUTOHUNTER_RESTORE_DB_CONNECT_TIMEOUT:-15}"
credential_source="${AUTOHUNTER_RESTORE_CREDENTIAL_SOURCE:-keychain}"
keychain_service="${AUTOHUNTER_RESTORE_KEYCHAIN_SERVICE:-$DEFAULT_KEYCHAIN_SERVICE}"
keychain_account="${AUTOHUNTER_RESTORE_DB_KEYCHAIN_ACCOUNT:-$target_id}"
ssh_host="${AUTOHUNTER_BACKUP_SSH_HOST:-}"
ssh_port="${AUTOHUNTER_BACKUP_SSH_PORT:-22}"
rclone_path_prefix="${AUTOHUNTER_BACKUP_RCLONE_PATH_PREFIX:-}"

[[ "$database_host" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ && ${#database_host} -le 253 ]] ||
  die "invalid_restore_database_host"
[[ "$database_port" =~ ^[0-9]+$ && ${#database_port} -le 5 &&
  "$database_port" -ge 1 && "$database_port" -le 65535 ]] ||
  die "invalid_restore_database_port"
[[ "$database_user" =~ ^[A-Za-z_][A-Za-z0-9_.-]*$ && ${#database_user} -le 128 ]] ||
  die "invalid_restore_database_user"
[[ "$database_name" == "$expected_database_name" ]] ||
  die "restore_database_name_guard_mismatch"
if [[ -n "${AUTOHUNTER_BACKUP_DB_HOST:-}" &&
  "$database_host" == "${AUTOHUNTER_BACKUP_DB_HOST}" ]]; then
  die "restore_target_matches_source_host"
fi
[[ -z "${AUTOHUNTER_RESTORE_DB_SSLMODE:-}" ||
  "${AUTOHUNTER_RESTORE_DB_SSLMODE}" == "$database_sslmode" ]] ||
  die "invalid_restore_database_sslmode"
validate_absolute_path "$database_sslrootcert" "invalid_restore_ssl_root_certificate_path"
[[ -f "$database_sslrootcert" && -r "$database_sslrootcert" ]] ||
  die "restore_ssl_root_certificate_unavailable"
[[ "$database_sslrootcert_sha256" =~ ^[a-f0-9]{64}$ ]] ||
  die "invalid_restore_ssl_root_certificate_digest"
actual_database_sslrootcert_sha256="$(local_file_sha256 "$database_sslrootcert")" ||
  die "restore_ssl_root_certificate_digest_unavailable"
[[ "$actual_database_sslrootcert_sha256" == "$database_sslrootcert_sha256" ]] ||
  die "restore_ssl_root_certificate_digest_mismatch"
[[ "$database_connect_timeout" =~ ^[0-9]+$ && ${#database_connect_timeout} -le 2 &&
  "$database_connect_timeout" -ge 1 && "$database_connect_timeout" -le 60 ]] ||
  die "invalid_restore_database_connect_timeout"
[[ "$ssh_host" =~ ^[A-Za-z0-9_][A-Za-z0-9_.@-]*$ && ${#ssh_host} -le 253 ]] ||
  die "invalid_ssh_host"
[[ "$ssh_port" =~ ^[0-9]+$ && ${#ssh_port} -le 5 &&
  "$ssh_port" -ge 1 && "$ssh_port" -le 65535 ]] || die "invalid_ssh_port"
[[ "$rclone_path_prefix" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ &&
  "$rclone_path_prefix" != *//* && "$rclone_path_prefix" != */ ]] ||
  die "invalid_rclone_path_prefix"
validate_text_label "$keychain_service" "invalid_restore_keychain_service"
validate_text_label "$keychain_account" "invalid_restore_keychain_account"
case "$credential_source" in keychain|broker-env) ;; *) die "invalid_restore_credential_source" ;; esac

if [[ "$credential_source" == "keychain" ]]; then
  command -v security >/dev/null 2>&1 || die "macos_keychain_unavailable"
  database_password="$(
    security find-generic-password -s "$keychain_service" -a "$keychain_account" -w 2>/dev/null
  )" || die "restore_database_credential_unavailable"
else
  [[ "${AUTOHUNTER_RESTORE_BROKER_APPROVED:-}" == "1" ]] ||
    die "restore_broker_approval_marker_missing"
  database_password="${AUTOHUNTER_RESTORE_DB_PASSWORD:-}"
fi
[[ -n "$database_password" && "$database_password" != *$'\n'* &&
  "$database_password" != *$'\r'* ]] || die "restore_database_credential_invalid"
unset AUTOHUNTER_RESTORE_DB_PASSWORD

"$BACKUP_SCRIPT" --verify-receipt "$receipt_input" >/dev/null ||
  die "source_backup_receipt_verification_failed"

local_pg_restore_version="$(pg_restore --version 2>/dev/null)" ||
  die "pg_restore_version_unavailable"
[[ "$local_pg_restore_version" =~ ([0-9]+)\.([0-9]+) ]] || die "invalid_pg_restore_version"
[[ "${BASH_REMATCH[1]}" == "$REQUIRED_POSTGRES_MAJOR" ]] || die "local_pg_restore_major_mismatch"
local_pg_restore_short_version="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}"

readonly DB_CONNECTION_ARGS=(
  --host="$database_host"
  --port="$database_port"
  --username="$database_user"
  --dbname="$database_name"
  --no-password
)
target_probe="$(
  PGPASSWORD="$database_password" \
  PGSSLMODE="$database_sslmode" \
  PGSSLROOTCERT="$database_sslrootcert" \
  PGCONNECT_TIMEOUT="$database_connect_timeout" \
  PGAPPNAME=autohunter-portable-restore-preflight \
    psql "${DB_CONNECTION_ARGS[@]}" --no-psqlrc --no-align --tuples-only --quiet \
      --field-separator=$'\t' --set=ON_ERROR_STOP=1 --command="
with user_relations as (
  select count(*)::bigint as relation_count
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
    and n.nspname !~ '^pg_toast'
    and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
), target_schemas as (
  select count(*)::bigint as schema_count
  from pg_namespace where nspname in ('auth', 'public', 'catcht')
)
select case
  when current_database() = '${expected_database_name}'
    and (select relation_count from user_relations) = 0
    and (select schema_count from target_schemas) = 0
  then 'TARGET_READY' else 'TARGET_NOT_READY' end,
  current_setting('server_version_num'), current_database();" 2>/dev/null
)" || die "restore_target_preflight_query_failed"
IFS=$'\t' read -r target_probe_status target_server_version_num target_database_readback <<<"$target_probe"
[[ "$target_probe_status" == "TARGET_READY" ]] || die "target_database_not_empty"
[[ "$target_database_readback" == "$expected_database_name" ]] || die "restore_target_identity_mismatch"
[[ "$target_server_version_num" =~ ^[0-9]+$ ]] || die "invalid_restore_target_server_version"
target_server_major=$((target_server_version_num / 10000))
[[ "$target_server_major" == "$REQUIRED_POSTGRES_MAJOR" ]] || die "restore_target_major_mismatch"

if [[ "$mode" == "preflight" ]]; then
  printf 'status=ready mode=restore-drill source_project_ref=%s target_id=%s\n' \
    "$source_project_ref" "$target_id"
  exit 0
fi

readonly SSH_ARGS=(
  -o BatchMode=yes
  -o ConnectTimeout=15
  -o ForwardAgent=no
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=2
  -o StrictHostKeyChecking=yes
  -p "$ssh_port"
)

restore_started_epoch="$(date -u +%s)"
restore_started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
if ! (
  ssh "${SSH_ARGS[@]}" -- "$ssh_host" \
    "exec rclone cat '${rclone_remote}:${archive_object_path}'" 2>/dev/null |
    PGPASSWORD="$database_password" \
    PGSSLMODE="$database_sslmode" \
    PGSSLROOTCERT="$database_sslrootcert" \
    PGCONNECT_TIMEOUT="$database_connect_timeout" \
    PGAPPNAME=autohunter-portable-restore-drill \
      pg_restore "${DB_CONNECTION_ARGS[@]}" \
        --exit-on-error \
        --single-transaction \
        --no-owner \
        --no-privileges \
        --no-tablespaces \
        --no-table-access-method \
        --no-publications \
        --no-subscriptions \
        --no-security-labels \
        2>/dev/null
); then
  die "restore_stream_failed"
fi

aggregate_rows="$(
  PGPASSWORD="$database_password" \
  PGSSLMODE="$database_sslmode" \
  PGSSLROOTCERT="$database_sslrootcert" \
  PGCONNECT_TIMEOUT="$database_connect_timeout" \
  PGAPPNAME=autohunter-portable-restore-verify \
    psql "${DB_CONNECTION_ARGS[@]}" --no-psqlrc --no-align --tuples-only --quiet \
      --field-separator=$'\t' --set=ON_ERROR_STOP=1 2>/dev/null <<'SQL'
begin read only;
create temporary table autohunter_restore_counts (
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
    execute format('select count(*) from %I.%I', relation.schema_name, relation.table_name)
      into exact_count;
    insert into autohunter_restore_counts values (
      relation.schema_name, relation.table_name, exact_count
    );
  end loop;
end
$autohunter$;
select schema_name, table_name, row_count
from autohunter_restore_counts
order by schema_name, table_name;
rollback;
SQL
)" || die "restore_aggregate_verification_failed"

aggregate_table_count=0
aggregate_row_count=0
transient_auth_table_count=0
transient_auth_row_count=0
durable_auth_table_count=0
while IFS=$'\t' read -r schema_name table_name row_count; do
  [[ "$schema_name" =~ ^(auth|public|catcht)$ &&
    "$table_name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ && "$row_count" =~ ^[0-9]+$ ]] ||
    die "invalid_restore_aggregate_output"
  aggregate_table_count=$((aggregate_table_count + 1))
  aggregate_row_count=$((aggregate_row_count + row_count))
  if [[ "$schema_name" == "auth" ]]; then
    case "$table_name" in
      sessions|refresh_tokens|mfa_amr_claims|flow_state|one_time_tokens|mfa_challenges|audit_log_entries|saml_relay_states|oauth_client_states|webauthn_challenges)
        transient_auth_table_count=$((transient_auth_table_count + 1))
        transient_auth_row_count=$((transient_auth_row_count + row_count))
        ;;
      users|identities) durable_auth_table_count=$((durable_auth_table_count + 1)) ;;
    esac
  fi
done <<<"$aggregate_rows"
[[ "$aggregate_table_count" -gt 0 ]] || die "restored_table_inventory_empty"
[[ "$transient_auth_table_count" -eq 10 ]] || die "transient_auth_inventory_mismatch"
[[ "$transient_auth_row_count" -eq 0 ]] || die "transient_auth_rows_restored"
[[ "$durable_auth_table_count" -eq 2 ]] || die "durable_auth_inventory_mismatch"

aggregate_counts_sha256="$(
  printf '%s\n' "$aggregate_rows" |
    node --input-type=module -e '
      import { createHash } from "node:crypto";
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      process.stdout.write(createHash("sha256").update(Buffer.concat(chunks)).digest("hex"));
    '
)" || die "aggregate_counts_digest_failed"
[[ "$aggregate_counts_sha256" =~ ^[a-f0-9]{64}$ ]] || die "invalid_aggregate_counts_digest"
if [[ "$aggregate_table_count" != "$expected_aggregate_table_count" ||
  "$aggregate_row_count" != "$expected_aggregate_row_count" ||
  "$aggregate_counts_sha256" != "$expected_aggregate_counts_sha256" ]]; then
  die "restore_aggregate_mismatch"
fi

restore_completed_epoch="$(date -u +%s)"
restore_completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
restore_duration_seconds=$((restore_completed_epoch - restore_started_epoch))
script_sha256="$(node --input-type=module -e '
  import { createHash } from "node:crypto";
  import { readFileSync } from "node:fs";
  process.stdout.write(createHash("sha256").update(readFileSync(process.argv[1])).digest("hex"));
' "${SCRIPT_DIR}/verify-portable-postgres-restore.sh")" || die "restore_script_digest_failed"
reviewed_git_sha="$(git -C "$REPO_ROOT" rev-parse --verify HEAD 2>/dev/null)" ||
  die "reviewed_git_sha_unavailable"

default_receipt_dir=""
if [[ -n "${HOME:-}" ]]; then
  default_receipt_dir="${HOME}/Library/Application Support/AutoHunter/restore-drill-receipts"
fi
receipt_dir="${AUTOHUNTER_RESTORE_RECEIPT_DIR:-$default_receipt_dir}"
validate_absolute_path "$receipt_dir" "invalid_restore_receipt_directory"
mkdir -p "$receipt_dir" || die "restore_receipt_directory_create_failed"
chmod 700 "$receipt_dir" || die "restore_receipt_directory_permission_failed"
timestamp_compact="$(date -u +%Y%m%dT%H%M%SZ)"
date_path="$(date -u +%Y/%m/%d)"
receipt_path="${receipt_dir}/autohunter-restore-${source_project_ref}-${target_id}-${timestamp_compact}-$$.json"
pending_receipt_path="${receipt_path}.pending"
remote_receipt_path="${rclone_path_prefix}/restore-drills/${date_path}/autohunter-restore-${source_project_ref}-${target_id}-${timestamp_compact}-$$.receipt.json"
[[ "$remote_receipt_path" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ && ${#remote_receipt_path} -le 420 ]] ||
  die "invalid_restore_remote_receipt_path"
[[ ! -e "$receipt_path" && ! -e "$pending_receipt_path" ]] || die "restore_receipt_already_exists"

(
  set -o noclobber
  printf '%s\n' "{
  \"restore_receipt_version\": 1,
  \"tool_version\": \"${SCRIPT_VERSION}\",
  \"status\": \"verified\",
  \"source_project_ref\": \"${source_project_ref}\",
  \"target_id\": \"${target_id}\",
  \"target_database_name\": \"${database_name}\",
  \"started_at\": \"${restore_started_at}\",
  \"completed_at\": \"${restore_completed_at}\",
  \"duration_seconds\": ${restore_duration_seconds},
  \"source_archive_sha256\": \"${archive_sha256}\",
  \"source_receipt_object_path\": \"${source_receipt_object_path}\",
  \"source_manifest_sha256\": \"${source_manifest_sha256}\",
  \"current_manifest_sha256\": \"${manifest_sha256}\",
  \"source_reviewed_git_sha\": \"${source_reviewed_git_sha}\",
  \"reviewed_git_sha\": \"${reviewed_git_sha}\",
  \"restore_script_sha256\": \"${script_sha256}\",
  \"pg_restore_version\": \"${local_pg_restore_short_version}\",
  \"target_postgres_server_version_num\": ${target_server_version_num},
  \"aggregate_table_count\": ${aggregate_table_count},
  \"aggregate_row_count\": ${aggregate_row_count},
  \"aggregate_counts_sha256\": \"${aggregate_counts_sha256}\",
  \"source_database_sslrootcert_sha256\": \"${source_database_sslrootcert_sha256}\",
  \"target_database_sslrootcert_sha256\": \"${database_sslrootcert_sha256}\",
  \"transient_auth_row_count\": ${transient_auth_row_count},
  \"schemas\": [\"auth\", \"public\", \"catcht\"],
  \"transactional_restore\": true,
  \"isolated_target_verified\": true,
  \"receipt_object_path\": \"${remote_receipt_path}\",
  \"receipt_remote_immutable\": true,
  \"receipt_contains_private_rows\": false
}" >"$pending_receipt_path"
) || die "restore_receipt_write_failed"
chmod 600 "$pending_receipt_path" || die "restore_receipt_permission_failed"

if ! ssh "${SSH_ARGS[@]}" -- "$ssh_host" \
  "exec rclone rcat '${rclone_remote}:${remote_receipt_path}' --immutable" \
  <"$pending_receipt_path" >/dev/null 2>/dev/null; then
  die "restore_remote_receipt_upload_failed"
fi
expected_receipt_sha256="$(node --input-type=module -e '
  import { createHash } from "node:crypto";
  import { readFileSync } from "node:fs";
  process.stdout.write(createHash("sha256").update(readFileSync(process.argv[1])).digest("hex"));
' "$pending_receipt_path")" || die "restore_receipt_digest_failed"
remote_receipt_result="$(
  ssh "${SSH_ARGS[@]}" -- "$ssh_host" bash -s -- \
    "$rclone_remote" "$remote_receipt_path" "$expected_receipt_sha256" <<'REMOTE' 2>/dev/null
set -Eeuo pipefail
set +x
actual="$(rclone cat "${1}:${2}" 2>/dev/null | sha256sum | awk '{ print $1 }')"
[[ "$actual" == "$3" ]]
printf 'REMOTE_RECEIPT_SHA256=%s\n' "$actual"
REMOTE
)" || die "restore_remote_receipt_verification_failed"
[[ "$remote_receipt_result" == "REMOTE_RECEIPT_SHA256=${expected_receipt_sha256}" ]] ||
  die "restore_remote_receipt_verification_failed"
mv "$pending_receipt_path" "$receipt_path" || die "restore_receipt_finalize_failed"
chmod 600 "$receipt_path" || die "restore_receipt_permission_failed"

printf 'status=complete mode=restore-drill receipt=%s\n' "$receipt_path"
