import assert from "node:assert/strict";
import { access, chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const scriptUrl = new URL("../scripts/backup-portable-postgres.sh", import.meta.url);

async function source() {
  return readFile(scriptUrl, "utf8");
}

test("portable backup defaults to preflight and requires an explicit execute confirmation", async () => {
  await access(scriptUrl, constants.X_OK);
  const script = await source();

  assert.match(script, /mode=["']preflight["']/);
  assert.match(script, /--execute/);
  assert.match(script, /--confirm-source-id/);
  assert.match(script, /source_confirmation_mismatch/);
  assert.match(script, /Preflight complete; no backup was created/);
  assert.match(script, /set -Eeuo pipefail/);
  assert.match(script, /set \+x/);
  assert.match(script, /umask 077/);

  const help = spawnSync("bash", [scriptUrl.pathname, "--help"], {
    encoding: "utf8",
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /preflight/i);
  assert.match(help.stdout, /verify-receipt/i);
  assert.match(help.stdout, /list-toc/i);
  assert.doesNotMatch(help.stdout, /restore-live|--restore/);
});

test("database and remote credentials never enter argv, URLs, receipts, or output", async () => {
  const script = await source();

  assert.match(script, /security find-generic-password/);
  assert.match(script, /AUTOHUNTER_BACKUP_BROKER_APPROVED/);
  assert.match(script, /AUTOHUNTER_BACKUP_DB_PASSWORD/);
  assert.match(script, /unset AUTOHUNTER_BACKUP_DB_PASSWORD/);
  assert.match(script, /PGPASSWORD="\$database_password"/);
  assert.match(script, /set \+x/);
  assert.doesNotMatch(script, /postgres(?:ql)?:\/\/[^\s"']*:[^\s"']+@/i);
  assert.doesNotMatch(script, /(?:pg_dump|psql)[^\n]*(?:--password|\$database_password)/);
  assert.doesNotMatch(script, /(?:echo|printf)[^\n]*(?:DB_PASSWORD|database_password|PGPASSWORD)/i);
  assert.doesNotMatch(script, /rclone\s+config\s+(?:dump|show)[^\n]*>&?\s*[12]?$/m);
});

test("the artifact is a portable PostgreSQL 17 custom archive streamed directly to rclone crypt", async () => {
  const script = await source();

  assert.match(script, /REQUIRED_POSTGRES_MAJOR=["']17["']/);
  assert.match(script, /local_pg_dump_major[\s\S]{0,300}REQUIRED_POSTGRES_MAJOR/);
  assert.match(script, /source_server_major[\s\S]{0,300}REQUIRED_POSTGRES_MAJOR/);
  assert.match(script, /remote_pg_restore_major[\s\S]{0,300}REQUIRED_POSTGRES_MAJOR/);
  assert.match(script, /--format=custom/);
  assert.match(script, /--compress=zstd:6/);
  assert.match(script, /--schema=auth/);
  assert.match(script, /--schema=public/);
  assert.match(script, /--schema=catcht/);
  assert.match(script, /--strict-names/);
  assert.match(script, /--no-owner/);
  assert.match(script, /--no-privileges/);
  assert.match(script, /--no-publications/);
  assert.match(script, /--no-subscriptions/);
  assert.match(script, /--exclude-table-data=auth\.sessions/);
  assert.match(script, /--exclude-table-data=auth\.refresh_tokens/);
  assert.match(script, /pg_dump[\s\S]{0,1800}\|[\s\\]*ssh[\s\S]{0,500}rclone rcat/);
  assert.doesNotMatch(script, /pg_dump[^\n]*(?:--file|-f(?:=|\s))/);
  assert.doesNotMatch(script, /mktemp|\.dump\b|\.backup\b|dump\.sql/);
});

test("aggregate parity is captured from the same exported snapshot as pg_dump", async () => {
  const script = await source();

  assert.match(script, /pg_export_snapshot\(\)/);
  assert.match(script, /start_source_snapshot/);
  assert.match(script, /read_source_aggregate_inventory "\$source_snapshot_id"/);
  assert.match(script, /pg_dump[\s\S]{0,700}--snapshot="\$source_snapshot_id"/);
  assert.match(script, /stop_source_snapshot/);
  assert.match(script, /snapshot_control_dir/);
  assert.match(script, /mkfifo/);
  assert.doesNotMatch(script, /pg_export_snapshot[\s\S]{0,500}pg_sleep/);
});

test("preflight validates strict nonsecret configuration and proves the remote is crypt", async () => {
  const script = await source();

  for (const variable of [
    "AUTOHUNTER_BACKUP_SSH_HOST",
    "AUTOHUNTER_BACKUP_RCLONE_REMOTE",
    "AUTOHUNTER_BACKUP_RCLONE_PATH_PREFIX",
    "AUTOHUNTER_BACKUP_DB_HOST",
    "AUTOHUNTER_BACKUP_DB_PORT",
    "AUTOHUNTER_BACKUP_DB_USER",
    "AUTOHUNTER_BACKUP_DB_NAME",
    "AUTOHUNTER_BACKUP_SOURCE_ID",
    "AUTOHUNTER_BACKUP_DB_SSLROOTCERT",
    "AUTOHUNTER_BACKUP_DB_SSLROOTCERT_SHA256",
    "AUTOHUNTER_INFRASTRUCTURE_CONTRACT",
  ]) {
    assert.match(script, new RegExp(variable));
  }

  assert.match(script, /invalid_ssh_host/);
  assert.match(script, /invalid_rclone_remote/);
  assert.match(script, /invalid_rclone_path_prefix/);
  assert.match(script, /invalid_database_host/);
  assert.match(script, /database_sslmode=.*verify-full/);
  assert.match(script, /PGSSLMODE="\$database_sslmode"/);
  assert.match(script, /PGSSLROOTCERT="\$database_sslrootcert"/);
  assert.match(script, /database_sslrootcert_sha256/);
  assert.match(script, /database_ssl_root_certificate_digest_mismatch/);
  assert.doesNotMatch(script, /database_sslmode=.*(?:require|verify-ca)/);
  assert.match(script, /type["']?\s*==?\s*["']crypt["']|\$3 == "crypt"/);
  assert.match(script, /no_data_encryption/);
  assert.match(script, /data_encryption_disabled/);
  assert.match(script, /rclone lsf/);
  assert.match(script, /pg_dump[\s\S]*--schema-only[\s\S]*\/dev\/null/);
  assert.match(script, /deployment\.activeProjectRef/);
  assert.match(script, /source_project_ref_not_active/);
  assert.match(script, /\^\[a-z0-9\]\{20\}\$/);
});

test("post-upload and receipt verification re-read the crypt object without local plaintext", async () => {
  const script = await source();

  assert.match(script, /remote_archive_metadata/);
  assert.match(script, /stream_remote_archive/);
  assert.match(script, /archive_stream_status.*141/);
  assert.match(script, /rclone cat/);
  assert.match(script, /rclone cat[^\n]*--head 1/);
  assert.doesNotMatch(script, /rclone lsjson[^\n]*--stat/);
  assert.match(script, /object_dir="\$\{object_path%\/\*\}"/);
  assert.match(script, /object_name="\$\{object_path##\*\/\}"/);
  assert.match(script, /rclone lsf[^\n]*--files-only[^\n]*--max-depth 1/);
  assert.match(script, /--include '\/\$\{object_name\}'/);
  assert.match(script, /sha256sum/);
  assert.match(script, /wc -c/);
  assert.match(script, /pg_restore --list/);
  assert.match(script, /ARCHIVE_SHA256=/);
  assert.match(script, /ARCHIVE_BYTES=/);
  assert.match(script, /TOC_SHA256=/);
  assert.match(script, /TOC_ENTRIES=/);
  assert.match(script, /archive_sha256_mismatch/);
  assert.match(script, /archive_byte_size_mismatch/);
  assert.match(script, /toc_sha256_mismatch/);
  assert.match(script, /toc_entry_count_mismatch/);
  assert.doesNotMatch(script, /rclone copyto|rclone copy\s/);
});

test("the row-free JSON receipt is restrictive, versioned, remotely immutable, and restore-free", async () => {
  const script = await source();

  assert.match(script, /\\?"receipt_version\\?": 2/);
  assert.match(script, /\\?"source_project_ref\\?"/);
  assert.match(script, /\\?"archive_format\\?": \\?"postgresql-custom\\?"/);
  assert.match(script, /\\?"transport\\?": \\?"ssh\+rclone-crypt\\?"/);
  assert.match(script, /\\?"archive_sha256\\?"/);
  assert.match(script, /\\?"archive_bytes\\?"/);
  assert.match(script, /\\?"toc_sha256\\?"/);
  assert.match(script, /\\?"toc_entries\\?"/);
  assert.match(script, /\\?"aggregate_table_count\\?"/);
  assert.match(script, /\\?"aggregate_row_count\\?"/);
  assert.match(script, /\\?"aggregate_counts_sha256\\?"/);
  assert.match(script, /\\?"database_sslrootcert_sha256\\?"/);
  assert.match(script, /\\?"status\\?": \\?"verified\\?"/);
  assert.match(script, /receipt_contains_private_rows\\?": false/);
  assert.match(script, /\\?"receipt_object_path\\?"/);
  assert.match(script, /\\?"receipt_remote_immutable\\?": true/);
  assert.match(script, /rclone rcat[^\n]*--immutable/);
  assert.match(script, /remote_receipt_verification_failed/);
  assert.match(script, /chmod 600/);
  assert.match(script, /--verify-receipt/);
  assert.match(script, /--list-toc/);
  assert.doesNotMatch(script, /pg_restore[^\n]*(?:--dbname|-d(?:=|\s))/);
  assert.doesNotMatch(script, /psql[^\n]*(?:insert|update|delete|truncate|alter|drop|create)/i);
});

test("simulated execute writes a restrictive receipt and verify rechecks all metadata", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "autohunter-portable-backup-"));
  const fakeBin = join(root, "bin");
  const receipts = join(root, "receipts");
  const manifestPath = join(root, "autohunter.production.json");
  const caPath = join(root, "supabase-ca.crt");
  const caContents = "synthetic-test-ca-certificate\n";
  const caSha256 = createHash("sha256").update(caContents).digest("hex");
  const sourceProjectRef = "abcdefghijklmnopqrst";
  await writeFile(join(root, ".keep"), "");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(fakeBin));
  await writeFile(
    manifestPath,
    JSON.stringify({
      projects: { source: { ref: sourceProjectRef } },
      deployment: { activeProjectRef: sourceProjectRef },
    }),
  );
  await writeFile(caPath, caContents);
  t.after(() => rm(root, { recursive: true, force: true }));

  const fakes = {
    pg_dump: `#!/usr/bin/env bash
if [[ "\${1:-}" == "--version" ]]; then
  printf '%s\\n' 'pg_dump (PostgreSQL) 17.10'
  exit 0
fi
[[ "\${PGSSLMODE:-}" == "verify-full" ]]
[[ "\${PGSSLROOTCERT:-}" == "\${FAKE_CA_PATH}" ]]
[[ "$*" == *"--schema=catcht"* ]] || exit 31
[[ "$*" != *"--schema=private"* ]] || exit 32
printf 'PGDMP-synthetic-archive'
`,
    psql: `#!/usr/bin/env bash
[[ "\${PGSSLMODE:-}" == "verify-full" ]]
[[ "\${PGSSLROOTCERT:-}" == "\${FAKE_CA_PATH}" ]]
if [[ "\${PGAPPNAME:-}" == "autohunter-portable-backup-snapshot-holder" ]]; then
  IFS= read -r _
  IFS= read -r _
  printf '%s\\n' '00000003-0000001B-1'
  while IFS= read -r line; do
    [[ "$line" == '\\q' ]] && exit 0
  done
  exit 0
elif [[ "$*" == *"server_version_num"* ]]; then
  printf '%s\\n' '170006'
else
  while IFS= read -r _; do :; done
  printf '%s\\n' \\
    $'auth\\tidentities\\t4' \\
    $'auth\\tsessions\\t0' \\
    $'auth\\tusers\\t4' \\
    $'catcht\\tuser_profiles\\t4'
fi
`,
    security: `#!/usr/bin/env bash
printf '%s\\n' 'synthetic-test-password'
`,
    rclone: `#!/usr/bin/env bash
printf '%s\\n' 'PGDMP-synthetic-archive'
exit "\${FAKE_TOC_STREAM_STATUS:-0}"
`,
    pg_restore: `#!/usr/bin/env bash
while IFS= read -r _; do :; done
printf '%s\\n' '; synthetic PostgreSQL archive TOC' '1; 0 0 SCHEMA - public owner'
exit "\${FAKE_TOC_PARSER_STATUS:-0}"
`,
    ssh: `#!/usr/bin/env bash
set -euo pipefail
arguments="$*"
if [[ "$arguments" == *"rclone lsf"*"--files-only"* ]]; then
  exit 1
fi
if [[ "$arguments" == *"exec rclone rcat"* ]]; then
  while IFS= read -r _; do :; done
  exit 0
fi
payload="$(while IFS= read -r line; do printf '%s\\n' "$line"; done)"
if [[ "$payload" == *"PG_RESTORE_MAJOR"* ]]; then
  printf '%s\\n' 'PG_RESTORE_MAJOR=17'
elif [[ "$payload" == *"ARCHIVE_SHA256"* ]]; then
  printf '%s\\n' \\
    'ARCHIVE_SHA256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' \\
    'ARCHIVE_BYTES=23' \\
    'TOC_SHA256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' \\
    'TOC_ENTRIES=7'
elif [[ "$payload" == *"REMOTE_RECEIPT_SHA256"* ]]; then
  printf 'REMOTE_RECEIPT_SHA256=%s\\n' "\${!#}"
elif [[ "$payload" == *"pg_restore --list"* ]]; then
  printf '%s\\n' "$payload" | /bin/bash -s -- vault artifact
else
  exit 2
fi
`,
  };

  for (const [name, body] of Object.entries(fakes)) {
    const path = join(fakeBin, name);
    await writeFile(path, body);
    await chmod(path, 0o755);
  }

  const env = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    AUTOHUNTER_BACKUP_SSH_HOST: "backup@example.test",
    AUTOHUNTER_BACKUP_RCLONE_REMOTE: "vault",
    AUTOHUNTER_BACKUP_RCLONE_PATH_PREFIX: "autohunter/postgres",
    AUTOHUNTER_BACKUP_DB_HOST: "aws-0-us-east-1.pooler.supabase.com",
    AUTOHUNTER_BACKUP_DB_PORT: "5432",
    AUTOHUNTER_BACKUP_DB_USER: `postgres.${sourceProjectRef}`,
    AUTOHUNTER_BACKUP_DB_NAME: "postgres",
    AUTOHUNTER_BACKUP_DB_SSLROOTCERT: caPath,
    AUTOHUNTER_BACKUP_DB_SSLROOTCERT_SHA256: caSha256,
    AUTOHUNTER_BACKUP_SOURCE_ID: sourceProjectRef,
    AUTOHUNTER_BACKUP_RECEIPT_DIR: receipts,
    AUTOHUNTER_INFRASTRUCTURE_CONTRACT: manifestPath,
    FAKE_CA_PATH: caPath,
  };

  const wrongCaDigest = spawnSync(
    "bash",
    [scriptUrl.pathname],
    {
      encoding: "utf8",
      env: {
        ...env,
        AUTOHUNTER_BACKUP_DB_SSLROOTCERT_SHA256: "0".repeat(64),
      },
    },
  );
  assert.notEqual(wrongCaDigest.status, 0);
  assert.match(
    wrongCaDigest.stderr,
    /status=failed reason=database_ssl_root_certificate_digest_mismatch/,
  );

  const unauthenticatedTls = spawnSync(
    "bash",
    [scriptUrl.pathname],
    {
      encoding: "utf8",
      env: {
        ...env,
        AUTOHUNTER_BACKUP_DB_SSLMODE: "require",
      },
    },
  );
  assert.notEqual(unauthenticatedTls.status, 0);
  assert.match(
    unauthenticatedTls.stderr,
    /status=failed reason=invalid_database_sslmode/,
  );

  const execute = spawnSync(
    "bash",
    [scriptUrl.pathname, "--execute", "--confirm-source-id", sourceProjectRef],
    { encoding: "utf8", env },
  );
  assert.equal(execute.status, 0, execute.stderr);
  assert.match(execute.stdout, /^status=complete receipt=.+\.json\n$/);
  assert.doesNotMatch(execute.stdout + execute.stderr, /synthetic-test-password/);

  const receiptPath = execute.stdout.trim().slice("status=complete receipt=".length);
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  assert.equal(receipt.receipt_version, 2);
  assert.deepEqual(receipt.schemas, ["auth", "public", "catcht"]);
  assert.equal(receipt.status, "verified");
  assert.equal(receipt.source_project_ref, sourceProjectRef);
  assert.equal(receipt.archive_bytes, 23);
  assert.equal(receipt.archive_sha256, "a".repeat(64));
  assert.equal(receipt.toc_sha256, "b".repeat(64));
  assert.equal(receipt.toc_entries, 7);
  assert.equal(receipt.aggregate_table_count, 4);
  assert.equal(receipt.aggregate_row_count, 12);
  assert.match(receipt.aggregate_counts_sha256, /^[a-f0-9]{64}$/);
  assert.equal(receipt.database_sslrootcert_sha256, caSha256);
  assert.equal(receipt.artifact_data_class, "restricted-production");
  assert.equal(receipt.receipt_contains_private_rows, false);
  assert.equal(receipt.receipt_remote_immutable, true);
  assert.match(receipt.receipt_object_path, /\.receipt\.json$/);
  assert.doesNotMatch(JSON.stringify(receipt), /password|credential|database_host/i);
  assert.equal((await stat(receiptPath)).mode & 0o777, 0o600);

  const artifactOnlyEnv = { ...env };
  delete artifactOnlyEnv.AUTOHUNTER_BACKUP_DB_SSLROOTCERT;
  delete artifactOnlyEnv.AUTOHUNTER_BACKUP_DB_SSLROOTCERT_SHA256;

  const verify = spawnSync(
    "bash",
    [scriptUrl.pathname, "--verify-receipt", receiptPath],
    { encoding: "utf8", env: artifactOnlyEnv },
  );
  assert.equal(verify.status, 0, verify.stderr);
  assert.equal(verify.stdout, `status=verified receipt=${receiptPath}\n`);

  const widenedReceiptPath = join(root, "widened-receipt.json");
  await writeFile(widenedReceiptPath, JSON.stringify({ ...receipt, rows: ["forbidden"] }));
  const widenedReceipt = spawnSync(
    "bash",
    [scriptUrl.pathname, "--verify-receipt", widenedReceiptPath],
    { encoding: "utf8", env: artifactOnlyEnv },
  );
  assert.notEqual(widenedReceipt.status, 0);
  assert.match(widenedReceipt.stderr, /status=failed reason=invalid_receipt/);

  const wrongSchemaPath = join(root, "ratewatch-schema-receipt.json");
  await writeFile(wrongSchemaPath, JSON.stringify({ ...receipt, schemas: ["auth", "public", "private"] }));
  const wrongSchema = spawnSync("bash", [scriptUrl.pathname, "--verify-receipt", wrongSchemaPath], {
    encoding: "utf8", env: artifactOnlyEnv,
  });
  assert.notEqual(wrongSchema.status, 0);
  assert.match(wrongSchema.stderr, /status=failed reason=invalid_receipt/);

  const listToc = spawnSync(
    "bash",
    [scriptUrl.pathname, "--list-toc", receiptPath],
    { encoding: "utf8", env: artifactOnlyEnv },
  );
  assert.equal(listToc.status, 0, listToc.stderr);
  assert.match(listToc.stdout, /synthetic PostgreSQL archive TOC/);
  assert.match(listToc.stdout, /SCHEMA - public/);

  const tocWithEarlyClose = spawnSync(
    "bash", [scriptUrl.pathname, "--list-toc", receiptPath],
    { encoding: "utf8", env: { ...artifactOnlyEnv, FAKE_TOC_STREAM_STATUS: "141" } },
  );
  assert.equal(tocWithEarlyClose.status, 0, tocWithEarlyClose.stderr);
  assert.match(tocWithEarlyClose.stdout, /synthetic PostgreSQL archive TOC/);

  for (const failure of [
    { FAKE_TOC_STREAM_STATUS: "42" },
    { FAKE_TOC_PARSER_STATUS: "42" },
  ]) {
    const failedToc = spawnSync(
      "bash", [scriptUrl.pathname, "--list-toc", receiptPath],
      { encoding: "utf8", env: { ...artifactOnlyEnv, ...failure } },
    );
    assert.notEqual(failedToc.status, 0, "TOC failures other than producer SIGPIPE must fail closed");
  }
});
