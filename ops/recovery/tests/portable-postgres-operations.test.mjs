import assert from "node:assert/strict";
import { access, chmod, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

const scheduledUrl = new URL("../scripts/run-portable-postgres-backup-scheduled.sh", import.meta.url);
const restoreUrl = new URL("../scripts/verify-portable-postgres-restore.sh", import.meta.url);

test("the scheduled wrapper binds the backup to the manifest and fails in an alertable way", async () => {
  await access(scheduledUrl, constants.X_OK);
  const script = await readFile(scheduledUrl, "utf8");

  assert.match(script, /set -Eeuo pipefail/);
  assert.match(script, /set \+x/);
  assert.match(script, /umask 077/);
  assert.match(script, /AUTOHUNTER_BACKUP_SCHEDULE_APPROVED/);
  assert.match(script, /deployment\.activeProjectRef/);
  assert.match(script, /source_project_ref_not_active/);
  assert.match(script, /mkdir[^\n]*lock/);
  assert.match(script, /backup_already_running/);
  assert.match(script, /trap[^\n]*cleanup/);
  assert.match(script, /set -m[\s\S]{0,300}backup_pid="\$!"[\s\S]{0,100}set \+m/);
  assert.match(script, /ps -o pgid= -p/);
  assert.match(script, /observed_pgid" != "\$backup_pid"[\s\S]{0,100}observed_pgid" == "\$scheduler_pgid"/);
  assert.match(script, /backup_pgid="\$observed_pgid"/);
  assert.match(script, /kill -TERM -- "-\$backup_pgid"/);
  assert.match(script, /kill -KILL -- "-\$backup_pgid"/);
  assert.match(script, /--execute[\s\\]+--confirm-source-id[\s\\]+"\$active_project_ref"/);
  assert.match(script, /status=failed reason=/);
  assert.doesNotMatch(script, /AUTOHUNTER_BACKUP_DB_PASSWORD/);
  assert.doesNotMatch(script, /launchctl\s+(?:load|bootstrap)|crontab\s/);
});

test("the scheduled wrapper executes preflight then one exact-ref backup and rejects overlap", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "autohunter-backup-schedule-"));
  const scriptsDir = join(root, "scripts");
  const infraDir = join(root, "infra");
  const lockPath = join(root, "backup.lock");
  const logPath = join(root, "calls.log");
  const manifestPath = join(infraDir, "autohunter.production.json");
  const projectRef = "abcdefghijklmnopqrst";
  await mkdir(scriptsDir, { recursive: true });
  await mkdir(infraDir, { recursive: true });
  await cp(scheduledUrl, join(scriptsDir, "run-portable-postgres-backup-scheduled.sh"));
  await chmod(join(scriptsDir, "run-portable-postgres-backup-scheduled.sh"), 0o755);
  await writeFile(
    manifestPath,
    JSON.stringify({
      projects: { source: { ref: projectRef } },
      deployment: { activeProjectRef: projectRef },
    }),
  );
  await writeFile(
    join(scriptsDir, "backup-portable-postgres.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >>"$FAKE_CALL_LOG"
if [[ "$#" -eq 0 ]]; then
  printf '%s\\n' 'status=ready postgres_major=17 remote_archive_reader_major=17'
else
  printf '%s\\n' 'status=complete receipt=/private/row-free-receipt.json'
fi
`,
  );
  await chmod(join(scriptsDir, "backup-portable-postgres.sh"), 0o755);
  t.after(() => rm(root, { recursive: true, force: true }));

  const env = {
    ...process.env,
    FAKE_CALL_LOG: logPath,
    AUTOHUNTER_BACKUP_SCHEDULE_APPROVED: "1",
    AUTOHUNTER_BACKUP_SOURCE_ID: projectRef,
    AUTOHUNTER_INFRASTRUCTURE_CONTRACT: manifestPath,
    AUTOHUNTER_BACKUP_LOCK_PATH: lockPath,
  };
  const wrapperPath = join(scriptsDir, "run-portable-postgres-backup-scheduled.sh");
  const result = spawnSync("bash", [wrapperPath], { encoding: "utf8", env });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /status=complete mode=scheduled project_ref=abcdefghijklmnopqrst/);
  assert.equal(await readFile(logPath, "utf8"), `\n--execute --confirm-source-id ${projectRef}\n`);

  await mkdir(lockPath);
  const overlap = spawnSync("bash", [wrapperPath], { encoding: "utf8", env });
  assert.notEqual(overlap.status, 0);
  assert.match(overlap.stderr, /status=failed reason=backup_already_running/);
});

test("the scheduled wrapper keeps its lock until the complete backup process group exits", { timeout: 30_000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "autohunter-backup-process-group-"));
  const scriptsDir = join(root, "scripts");
  const infraDir = join(root, "infra");
  const lockPath = join(root, "backup.lock");
  const manifestPath = join(infraDir, "autohunter.production.json");
  const backupPidPath = join(root, "backup.pid");
  const childPidPath = join(root, "child.pid");
  const grandchildPidPath = join(root, "grandchild.pid");
  const terminatingPath = join(root, "grandchild-terminating");
  const projectRef = "abcdefghijklmnopqrst";
  let wrapper;

  const readPid = async (path) => Number.parseInt(await readFile(path, "utf8"), 10);
  const waitForFile = async (path) => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try {
        return await readFile(path, "utf8");
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      await delay(10);
    }
    throw new Error(`timed out waiting for ${path}`);
  };
  const processExists = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if (error?.code === "ESRCH") return false;
      throw error;
    }
  };

  await mkdir(scriptsDir, { recursive: true });
  await mkdir(infraDir, { recursive: true });
  await cp(scheduledUrl, join(scriptsDir, "run-portable-postgres-backup-scheduled.sh"));
  await chmod(join(scriptsDir, "run-portable-postgres-backup-scheduled.sh"), 0o755);
  await writeFile(
    manifestPath,
    JSON.stringify({
      projects: { source: { ref: projectRef } },
      deployment: { activeProjectRef: projectRef },
    }),
  );
  await writeFile(
    join(scriptsDir, "backup-portable-postgres.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
case "\${1:-}" in
  --fixture-child)
    printf '%s\\n' "$$" >"$FAKE_CHILD_PID"
    "$0" --fixture-grandchild &
    wait
    ;;
  --fixture-grandchild)
    printf '%s\\n' "$$" >"$FAKE_GRANDCHILD_PID"
    trap 'printf ready >"$FAKE_TERMINATING_MARKER"; trap "" TERM' TERM
    while :; do sleep 1 || true; done
    ;;
esac
if [[ "\${FAKE_BACKUP_HANG:-0}" == "1" && "$#" -eq 0 ]]; then
  printf '%s\\n' "$$" >"$FAKE_BACKUP_PID"
  "$0" --fixture-child &
  wait
fi
if [[ "$#" -eq 0 ]]; then
  printf '%s\\n' 'status=ready postgres_major=17 remote_archive_reader_major=17'
else
  printf '%s\\n' 'status=complete receipt=/private/row-free-receipt.json'
fi
`,
  );
  await chmod(join(scriptsDir, "backup-portable-postgres.sh"), 0o755);

  const env = {
    ...process.env,
    FAKE_BACKUP_HANG: "1",
    FAKE_BACKUP_PID: backupPidPath,
    FAKE_CHILD_PID: childPidPath,
    FAKE_GRANDCHILD_PID: grandchildPidPath,
    FAKE_TERMINATING_MARKER: terminatingPath,
    AUTOHUNTER_BACKUP_SCHEDULE_APPROVED: "1",
    AUTOHUNTER_BACKUP_SOURCE_ID: projectRef,
    AUTOHUNTER_INFRASTRUCTURE_CONTRACT: manifestPath,
    AUTOHUNTER_BACKUP_LOCK_PATH: lockPath,
  };
  const wrapperPath = join(scriptsDir, "run-portable-postgres-backup-scheduled.sh");
  t.after(async () => {
    wrapper?.kill("SIGKILL");
    for (const path of [backupPidPath, childPidPath, grandchildPidPath]) {
      try {
        process.kill(await readPid(path), "SIGKILL");
      } catch (error) {
        if (error?.code !== "ENOENT" && error?.code !== "ESRCH") throw error;
      }
    }
    await rm(root, { recursive: true, force: true });
  });

  wrapper = spawn("bash", [wrapperPath], { env, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  wrapper.stderr.setEncoding("utf8");
  wrapper.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  await Promise.all([waitForFile(backupPidPath), waitForFile(childPidPath), waitForFile(grandchildPidPath)]);
  const backupPid = await readPid(backupPidPath);
  const backupPgid = Number.parseInt(
    spawnSync("ps", ["-o", "pgid=", "-p", String(backupPid)], { encoding: "utf8" }).stdout.trim(),
    10,
  );
  const wrapperPgid = Number.parseInt(
    spawnSync("ps", ["-o", "pgid=", "-p", String(wrapper.pid)], { encoding: "utf8" }).stdout.trim(),
    10,
  );
  assert.equal(backupPgid, backupPid);
  assert.notEqual(backupPgid, wrapperPgid);
  wrapper.kill("SIGTERM");
  await waitForFile(terminatingPath);

  const overlap = spawnSync("bash", [wrapperPath], {
    encoding: "utf8",
    env: { ...env, FAKE_BACKUP_HANG: "0" },
  });
  assert.notEqual(overlap.status, 0);
  assert.match(overlap.stderr, /status=failed reason=backup_already_running/);

  const [exitCode, exitSignal] = await new Promise((resolve) => {
    wrapper.once("close", (code, signal) => resolve([code, signal]));
  });
  assert.notEqual(exitCode, 0, `wrapper unexpectedly succeeded after SIGTERM; signal=${exitSignal}`);
  assert.match(stderr, /status=failed reason=interrupted/);
  const descendantPids = await Promise.all([readPid(childPidPath), readPid(grandchildPidPath)]);
  assert.deepEqual(descendantPids.map(processExists), [false, false]);

  const afterCleanup = spawnSync("bash", [wrapperPath], {
    encoding: "utf8",
    env: { ...env, FAKE_BACKUP_HANG: "0" },
  });
  assert.equal(afterCleanup.status, 0, afterCleanup.stderr);
  assert.match(afterCleanup.stdout, /status=complete mode=scheduled project_ref=abcdefghijklmnopqrst/);
});

test("the restore drill is explicit, isolated, provider-portable, and secret-safe", async () => {
  await access(restoreUrl, constants.X_OK);
  const script = await readFile(restoreUrl, "utf8");

  assert.match(script, /mode="preflight"/);
  assert.match(script, /--execute/);
  assert.match(script, /--receipt/);
  assert.match(script, /--confirm-target-id/);
  assert.match(script, /target_confirmation_mismatch/);
  assert.match(script, /autohunter_restore_/);
  assert.match(script, /current_database\(\)/);
  assert.match(script, /target_database_not_empty/);
  assert.match(script, /source_project_ref_not_declared/);
  assert.match(script, /target_id_matches_production_project/);
  assert.match(script, /"\$BACKUP_SCRIPT" --verify-receipt/);
  assert.match(script, /pg_restore[\s\S]{0,900}--single-transaction/);
  assert.match(script, /--exit-on-error/);
  assert.doesNotMatch(script, /pg_restore[^\n]*--clean/);
  assert.doesNotMatch(script, /pg_restore[^\n]*--if-exists/);
  assert.match(script, /--no-owner/);
  assert.match(script, /--no-privileges/);
  assert.doesNotMatch(script, /pg_restore[^\n]*--create/);
  assert.match(script, /AUTOHUNTER_RESTORE_CREDENTIAL_SOURCE/);
  assert.match(script, /AUTOHUNTER_RESTORE_BROKER_APPROVED/);
  assert.match(script, /AUTOHUNTER_RESTORE_DB_SSLROOTCERT/);
  assert.match(script, /AUTOHUNTER_RESTORE_DB_SSLROOTCERT_SHA256/);
  assert.match(script, /unset AUTOHUNTER_RESTORE_DB_PASSWORD/);
  assert.match(script, /PGPASSWORD="\$database_password"/);
  assert.match(script, /PGSSLMODE="\$database_sslmode"/);
  assert.match(script, /PGSSLROOTCERT="\$database_sslrootcert"/);
  assert.match(script, /database_sslmode=.*verify-full/);
  assert.match(script, /restore_ssl_root_certificate_digest_mismatch/);
  assert.doesNotMatch(script, /database_sslmode=.*(?:require|verify-ca)/);
  assert.doesNotMatch(script, /postgres(?:ql)?:\/\/[^\s"']*:[^\s"']+@/i);
  assert.doesNotMatch(script, /(?:echo|printf)[^\n]*(?:DB_PASSWORD|database_password|PGPASSWORD)/i);
  assert.match(script, /aggregate_counts_sha256/);
  assert.match(script, /restore_aggregate_mismatch/);
  assert.match(script, /transient_auth_row_count/);
  assert.match(script, /receipt_remote_immutable/);
  assert.match(script, /rclone rcat[^\n]*--immutable/);
  assert.match(script, /status=failed reason=/);
});

test("restore preflight proves the exact isolated target without mutating it", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "autohunter-restore-drill-"));
  const scriptsDir = join(root, "scripts");
  const infraDir = join(root, "infra");
  const fakeBin = join(root, "bin");
  const manifestPath = join(infraDir, "autohunter.production.json");
  const receiptPath = join(root, "backup-receipt.json");
  const restoreReceipts = join(root, "restore-receipts");
  const aggregatePath = join(root, "aggregate.tsv");
  const caPath = join(root, "restore-ca.crt");
  const caContents = "synthetic-restore-ca-certificate\n";
  const caSha256 = createHash("sha256").update(caContents).digest("hex");
  const sourceRef = "abcdefghijklmnopqrst";
  const targetId = "drill-20260719a";
  const targetDatabase = "autohunter_restore_drill_20260719a";
  const aggregateRows = [
    "auth\taudit_log_entries\t0",
    "auth\tflow_state\t0",
    "auth\tidentities\t4",
    "auth\tmfa_amr_claims\t0",
    "auth\tmfa_challenges\t0",
    "auth\toauth_client_states\t0",
    "auth\tone_time_tokens\t0",
    "auth\trefresh_tokens\t0",
    "auth\tsaml_relay_states\t0",
    "auth\tsessions\t0",
    "auth\tusers\t4",
    "auth\twebauthn_challenges\t0",
    "catcht\tuser_profiles\t0",
  ].join("\n");
  const aggregateSha256 = createHash("sha256").update(`${aggregateRows}\n`).digest("hex");
  await mkdir(scriptsDir, { recursive: true });
  await mkdir(infraDir, { recursive: true });
  await mkdir(fakeBin, { recursive: true });
  await writeFile(aggregatePath, `${aggregateRows}\n`);
  await writeFile(caPath, caContents);
  await cp(restoreUrl, join(scriptsDir, "verify-portable-postgres-restore.sh"));
  await chmod(join(scriptsDir, "verify-portable-postgres-restore.sh"), 0o755);
  await writeFile(
    manifestPath,
    JSON.stringify({
      projects: { source: { ref: sourceRef } },
      deployment: { activeProjectRef: sourceRef },
    }),
  );
  await writeFile(
    receiptPath,
    JSON.stringify({
      receipt_version: 2,
      status: "verified",
      source_project_ref: sourceRef,
      archive_format: "postgresql-custom",
      transport: "ssh+rclone-crypt",
      rclone_remote: "vault",
      object_path: "autohunter/postgres/2026/07/19/archive.pgc",
      receipt_object_path: "autohunter/postgres/2026/07/19/archive.receipt.json",
      receipt_remote_immutable: true,
      invocation: "manual",
      infrastructure_contract_sha256: "c".repeat(64),
      backup_script_sha256: "d".repeat(64),
      reviewed_git_sha: "e".repeat(40),
      archive_sha256: "a".repeat(64),
      archive_bytes: 23,
      toc_sha256: "b".repeat(64),
      toc_entries: 7,
      aggregate_table_count: 13,
      aggregate_row_count: 8,
      aggregate_counts_sha256: aggregateSha256,
      database_sslrootcert_sha256: "f".repeat(64),
      schemas: ["auth", "public", "catcht"],
      transient_auth_table_data_excluded: true,
      artifact_data_class: "restricted-production",
      receipt_contains_private_rows: false,
    }),
  );
  await writeFile(
    join(scriptsDir, "backup-portable-postgres.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == "--verify-receipt" ]]
printf 'status=verified receipt=%s\\n' "$2"
`,
  );
  await chmod(join(scriptsDir, "backup-portable-postgres.sh"), 0o755);

  const fakes = {
    pg_restore: `#!/usr/bin/env bash
if [[ "\${1:-}" == "--version" ]]; then
  printf '%s\\n' 'pg_restore (PostgreSQL) 17.10'
  exit 0
fi
[[ "\${PGSSLMODE:-}" == "verify-full" ]]
[[ "\${PGSSLROOTCERT:-}" == "\${FAKE_CA_PATH}" ]]
while IFS= read -r _; do :; done
`,
    psql: `#!/usr/bin/env bash
[[ "\${PGSSLMODE:-}" == "verify-full" ]]
[[ "\${PGSSLROOTCERT:-}" == "\${FAKE_CA_PATH}" ]]
payload="$(while IFS= read -r line; do printf '%s\\n' "$line"; done)"
if [[ "$payload" == *"autohunter_restore_counts"* ]]; then
  /bin/cat "$FAKE_AGGREGATE_PATH"
else
  printf 'TARGET_READY\\t170006\\t%s\\n' "$AUTOHUNTER_RESTORE_DB_NAME"
fi
`,
    security: `#!/usr/bin/env bash
printf '%s\\n' 'synthetic-restore-password'
`,
    ssh: `#!/usr/bin/env bash
set -euo pipefail
arguments="$*"
if [[ "$arguments" == *"exec rclone rcat"* ]]; then
  while IFS= read -r _; do :; done
  exit 0
fi
if [[ "$arguments" == *"exec rclone cat"* ]]; then
  printf '%s' 'PGDMP-synthetic-archive'
  exit 0
fi
payload="$(while IFS= read -r line; do printf '%s\\n' "$line"; done)"
if [[ "$payload" == *"REMOTE_RECEIPT_SHA256"* ]]; then
  printf 'REMOTE_RECEIPT_SHA256=%s\\n' "\${!#}"
  exit 0
fi
exit 2
`,
  };
  for (const [name, body] of Object.entries(fakes)) {
    const path = join(fakeBin, name);
    await writeFile(path, body);
    await chmod(path, 0o755);
  }
  t.after(() => rm(root, { recursive: true, force: true }));

  const env = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    FAKE_AGGREGATE_PATH: aggregatePath,
    AUTOHUNTER_INFRASTRUCTURE_CONTRACT: manifestPath,
    AUTOHUNTER_BACKUP_SSH_HOST: "backup@example.test",
    AUTOHUNTER_BACKUP_RCLONE_REMOTE: "vault",
    AUTOHUNTER_BACKUP_RCLONE_PATH_PREFIX: "autohunter/postgres",
    AUTOHUNTER_RESTORE_DRILL_TARGET_ID: targetId,
    AUTOHUNTER_RESTORE_DB_HOST: "restore-db.example.test",
    AUTOHUNTER_RESTORE_DB_PORT: "5432",
    AUTOHUNTER_RESTORE_DB_USER: "restore_operator",
    AUTOHUNTER_RESTORE_DB_NAME: targetDatabase,
    AUTOHUNTER_RESTORE_DB_SSLROOTCERT: caPath,
    AUTOHUNTER_RESTORE_DB_SSLROOTCERT_SHA256: caSha256,
    AUTOHUNTER_RESTORE_RECEIPT_DIR: restoreReceipts,
    FAKE_CA_PATH: caPath,
  };
  const scriptPath = join(scriptsDir, "verify-portable-postgres-restore.sh");
  const unauthenticatedTls = spawnSync("bash", [scriptPath, "--receipt", receiptPath], {
    encoding: "utf8",
    env: {
      ...env,
      AUTOHUNTER_RESTORE_DB_SSLMODE: "require",
    },
  });
  assert.notEqual(unauthenticatedTls.status, 0);
  assert.match(unauthenticatedTls.stderr, /status=failed reason=invalid_restore_database_sslmode/);

  const wrongCaDigest = spawnSync("bash", [scriptPath, "--receipt", receiptPath], {
    encoding: "utf8",
    env: {
      ...env,
      AUTOHUNTER_RESTORE_DB_SSLROOTCERT_SHA256: "0".repeat(64),
    },
  });
  assert.notEqual(wrongCaDigest.status, 0);
  assert.match(
    wrongCaDigest.stderr,
    /status=failed reason=restore_ssl_root_certificate_digest_mismatch/,
  );

  const result = spawnSync("bash", [scriptPath, "--receipt", receiptPath], {
    encoding: "utf8",
    env,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`status=ready mode=restore-drill source_project_ref=${sourceRef} target_id=${targetId}`));
  assert.doesNotMatch(result.stdout + result.stderr, /synthetic-restore-password/);

  const mismatch = spawnSync(
    "bash",
    [scriptPath, "--execute", "--receipt", receiptPath, "--confirm-target-id", "wrong-target"],
    { encoding: "utf8", env },
  );
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /status=failed reason=target_confirmation_mismatch/);

  const productionTarget = spawnSync("bash", [scriptPath, "--receipt", receiptPath], {
    encoding: "utf8",
    env: {
      ...env,
      AUTOHUNTER_RESTORE_DRILL_TARGET_ID: sourceRef,
      AUTOHUNTER_RESTORE_DB_NAME: `autohunter_restore_${sourceRef}`,
    },
  });
  assert.notEqual(productionTarget.status, 0);
  assert.match(productionTarget.stderr, /target_id_matches_production_project/);

  for (const [key, value] of [
    ["user.email", "tomstetson@users.noreply.github.com"],
    ["user.name", "AutoHunter Test"],
  ]) {
    const configured = spawnSync("git", ["-C", root, "config", key, value], { encoding: "utf8" });
    if (configured.status !== 0) {
      spawnSync("git", ["-C", root, "init"], { encoding: "utf8" });
      spawnSync("git", ["-C", root, "config", key, value], { encoding: "utf8" });
    }
  }
  spawnSync("git", ["-C", root, "add", "scripts", "infra"], { encoding: "utf8" });
  const committed = spawnSync("git", ["-C", root, "commit", "-m", "test: initialize synthetic recovery fixture"], { encoding: "utf8" });
  assert.equal(committed.status, 0, committed.stderr);

  const execute = spawnSync(
    "bash",
    [scriptPath, "--execute", "--receipt", receiptPath, "--confirm-target-id", targetId],
    { encoding: "utf8", env },
  );
  assert.equal(execute.status, 0, execute.stderr);
  assert.match(execute.stdout, /^status=complete mode=restore-drill receipt=.+\.json\n$/);
  assert.doesNotMatch(execute.stdout + execute.stderr, /synthetic-restore-password/);
  const drillReceiptPath = execute.stdout.trim().slice("status=complete mode=restore-drill receipt=".length);
  const drillReceipt = JSON.parse(await readFile(drillReceiptPath, "utf8"));
  assert.equal(drillReceipt.status, "verified");
  assert.equal(drillReceipt.source_project_ref, sourceRef);
  assert.equal(drillReceipt.target_id, targetId);
  assert.equal(drillReceipt.aggregate_table_count, 13);
  assert.equal(drillReceipt.aggregate_row_count, 8);
  assert.equal(drillReceipt.aggregate_counts_sha256, aggregateSha256);
  assert.equal(drillReceipt.source_database_sslrootcert_sha256, "f".repeat(64));
  assert.equal(drillReceipt.target_database_sslrootcert_sha256, caSha256);
  assert.equal(drillReceipt.transient_auth_row_count, 0);
  assert.equal(drillReceipt.receipt_remote_immutable, true);
  assert.equal(drillReceipt.receipt_contains_private_rows, false);
  assert.equal((await stat(drillReceiptPath)).mode & 0o777, 0o600);
});
