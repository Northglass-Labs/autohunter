#!/usr/bin/env bash

# Scheduler-safe entrypoint for AutoHunter's portable PostgreSQL backup.
# This file defines the execution contract only; it does not install or enable
# launchd, cron, or any cloud scheduler.

set -Eeuo pipefail
set +x
IFS=$'\n\t'
umask 077

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
readonly BACKUP_SCRIPT="${SCRIPT_DIR}/backup-portable-postgres.sh"
readonly infrastructure_contract="${AUTOHUNTER_INFRASTRUCTURE_CONTRACT:-${REPO_ROOT}/infra/autohunter.production.json}"
readonly timeout_seconds="${AUTOHUNTER_BACKUP_TIMEOUT_SECONDS:-10800}"

default_lock_path=""
if [[ -n "${HOME:-}" ]]; then
  default_lock_path="${HOME}/Library/Application Support/AutoHunter/locks/portable-postgres-backup.lock"
fi
readonly lock_path="${AUTOHUNTER_BACKUP_LOCK_PATH:-$default_lock_path}"

lock_held="false"
lock_release_allowed="true"
backup_pid=""
backup_pgid=""
watchdog_pid=""

die() {
  printf 'status=failed reason=%s\n' "$1" >&2
  exit 1
}

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

read_process_group_id() {
  local observed_pgid=""

  observed_pgid="$(ps -o pgid= -p "$1" 2>/dev/null)" || return 1
  observed_pgid="${observed_pgid//[[:space:]]/}"
  [[ "$observed_pgid" =~ ^[0-9]+$ ]] || return 1
  printf '%s' "$observed_pgid"
}

process_group_alive() {
  [[ -n "$backup_pgid" ]] || return 1
  kill -0 -- "-$backup_pgid" >/dev/null 2>&1
}

terminate_process_group() {
  local remaining_checks=100

  [[ -n "$backup_pgid" ]] || return 0
  if process_group_alive; then
    kill -TERM -- "-$backup_pgid" >/dev/null 2>&1 || true
  fi
  while process_group_alive && [[ "$remaining_checks" -gt 0 ]]; do
    sleep 0.1
    remaining_checks=$((remaining_checks - 1))
  done
  if process_group_alive; then
    kill -KILL -- "-$backup_pgid" >/dev/null 2>&1 || true
  fi
  remaining_checks=100
  while process_group_alive && [[ "$remaining_checks" -gt 0 ]]; do
    sleep 0.1
    remaining_checks=$((remaining_checks - 1))
  done
  ! process_group_alive
}

stop_watchdog() {
  if [[ -n "$watchdog_pid" ]]; then
    kill "$watchdog_pid" >/dev/null 2>&1 || true
    wait "$watchdog_pid" >/dev/null 2>&1 || true
    watchdog_pid=""
  fi
}

cleanup() {
  local process_group_cleanup_proven="$lock_release_allowed"
  local terminator_pid=""

  stop_watchdog
  if [[ -n "$backup_pgid" ]]; then
    terminate_process_group &
    terminator_pid="$!"
  fi
  if [[ -n "$backup_pid" ]]; then
    wait "$backup_pid" >/dev/null 2>&1 || true
  fi
  if [[ -n "$terminator_pid" ]]; then
    wait "$terminator_pid" >/dev/null 2>&1 || process_group_cleanup_proven="false"
  fi
  if [[ -n "$backup_pgid" ]] && process_group_alive; then
    process_group_cleanup_proven="false"
  fi
  backup_pid=""
  backup_pgid=""
  if [[ "$lock_held" == "true" && "$process_group_cleanup_proven" == "true" ]]; then
    rm -f -- "${lock_path}/owner" "${lock_path}/timed-out" "${lock_path}/launch-gate" >/dev/null 2>&1 || true
    rmdir -- "$lock_path" >/dev/null 2>&1 || true
  elif [[ "$lock_held" == "true" ]]; then
    printf 'status=failed reason=backup_process_group_cleanup_unproven\n' >&2
  fi
}
trap cleanup EXIT
trap 'die interrupted' HUP INT TERM

for command_name in node mkdir chmod rm rmdir sleep kill ps; do
  command -v "$command_name" >/dev/null 2>&1 || die "missing_${command_name}"
done

scheduler_pgid="$(read_process_group_id "$$")" || die "scheduler_process_group_unavailable"
readonly scheduler_pgid

[[ "${AUTOHUNTER_BACKUP_SCHEDULE_APPROVED:-}" == "1" ]] ||
  die "schedule_approval_marker_missing"
[[ -x "$BACKUP_SCRIPT" ]] || die "backup_script_unavailable"
validate_absolute_path "$infrastructure_contract" "invalid_infrastructure_contract_path"
validate_absolute_path "$lock_path" "invalid_lock_path"
[[ -f "$infrastructure_contract" && -r "$infrastructure_contract" ]] ||
  die "infrastructure_contract_unavailable"
[[ "$timeout_seconds" =~ ^[0-9]+$ && ${#timeout_seconds} -le 5 &&
  "$timeout_seconds" -ge 60 && "$timeout_seconds" -le 21600 ]] ||
  die "invalid_backup_timeout"

active_project_ref="$(
  node --input-type=module - "$infrastructure_contract" <<'NODE' 2>/dev/null
import { readFileSync } from "node:fs";

const contract = JSON.parse(readFileSync(process.argv[2], "utf8"));
const deployment = contract?.deployment ?? {};
const ref = deployment.activeProjectRef;
const declared = Object.values(contract?.projects ?? {}).some((project) => project?.ref === ref);
if (!/^[a-z0-9]{20}$/.test(ref ?? "") || !declared) process.exit(1);
process.stdout.write(ref);
NODE
)" || die "invalid_infrastructure_contract"

[[ "${AUTOHUNTER_BACKUP_SOURCE_ID:-}" == "$active_project_ref" ]] ||
  die "source_project_ref_not_active"

lock_parent="${lock_path%/*}"
mkdir -p -- "$lock_parent" || die "lock_parent_create_failed"
chmod 700 "$lock_parent" || die "lock_parent_permission_failed"
if ! mkdir -- "$lock_path" 2>/dev/null; then
  die "backup_already_running"
fi
lock_held="true"
printf 'pid=%s project_ref=%s\n' "$$" "$active_project_ref" >"${lock_path}/owner" ||
  die "lock_owner_write_failed"
chmod 600 "${lock_path}/owner" || die "lock_owner_permission_failed"

run_bounded() {
  local failure_reason="$1"
  shift
  local launch_interrupted="false"
  local observed_pgid=""
  local process_group_cleanup_proven="true"
  local status=0
  local terminator_pid=""

  rm -f -- "${lock_path}/timed-out" "${lock_path}/launch-gate"
  trap 'launch_interrupted="true"' HUP INT TERM
  set -m
  (
    while [[ ! -e "${lock_path}/launch-gate" ]]; do
      sleep 0.01
    done
    exec "$@"
  ) &
  backup_pid="$!"
  set +m
  observed_pgid="$(read_process_group_id "$backup_pid")" || observed_pgid=""
  if [[ "$observed_pgid" != "$backup_pid" || "$observed_pgid" == "$scheduler_pgid" ]]; then
    lock_release_allowed="false"
    trap 'die interrupted' HUP INT TERM
    kill -TERM "$backup_pid" >/dev/null 2>&1 || true
    wait "$backup_pid" >/dev/null 2>&1 || true
    backup_pid=""
    die "backup_process_group_isolation_failed"
  fi
  backup_pgid="$observed_pgid"
  trap 'die interrupted' HUP INT TERM
  [[ "$launch_interrupted" == "false" ]] || die "interrupted"
  : >"${lock_path}/launch-gate"
  (
    watchdog_sleep_pid=""
    stop_watchdog() {
      if [[ -n "$watchdog_sleep_pid" ]]; then
        kill "$watchdog_sleep_pid" >/dev/null 2>&1 || true
        wait "$watchdog_sleep_pid" >/dev/null 2>&1 || true
      fi
      exit 0
    }
    trap stop_watchdog HUP INT TERM
    sleep "$timeout_seconds" &
    watchdog_sleep_pid="$!"
    wait "$watchdog_sleep_pid" || exit 0
    watchdog_sleep_pid=""
    : >"${lock_path}/timed-out"
    terminate_process_group
  ) &
  watchdog_pid="$!"

  wait "$backup_pid" || status=$?

  if [[ -e "${lock_path}/timed-out" ]]; then
    wait "$watchdog_pid" >/dev/null 2>&1 || process_group_cleanup_proven="false"
    watchdog_pid=""
  else
    stop_watchdog
    if process_group_alive; then
      terminate_process_group &
      terminator_pid="$!"
      wait "$terminator_pid" >/dev/null 2>&1 || process_group_cleanup_proven="false"
      status=1
    fi
  fi
  if process_group_alive; then
    process_group_cleanup_proven="false"
  fi
  if [[ "$process_group_cleanup_proven" != "true" ]]; then
    die "backup_process_group_cleanup_unproven"
  fi
  rm -f -- "${lock_path}/launch-gate"
  backup_pid=""
  backup_pgid=""

  if [[ -e "${lock_path}/timed-out" ]]; then
    die "backup_timeout"
  fi
  [[ "$status" -eq 0 ]] || die "$failure_reason"
}

run_bounded "backup_preflight_failed" \
  env AUTOHUNTER_INFRASTRUCTURE_CONTRACT="$infrastructure_contract" "$BACKUP_SCRIPT"
run_bounded "backup_execute_failed" \
  env AUTOHUNTER_INFRASTRUCTURE_CONTRACT="$infrastructure_contract" \
    AUTOHUNTER_BACKUP_INVOCATION=scheduled \
    "$BACKUP_SCRIPT" \
      --execute \
      --confirm-source-id "$active_project_ref"

printf 'status=complete mode=scheduled project_ref=%s\n' "$active_project_ref"
