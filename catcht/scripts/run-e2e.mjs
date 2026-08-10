import { execFileSync, spawnSync } from "node:child_process";

function command(binary, args) {
  return execFileSync(binary, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

function parseEnv(output) {
  return Object.fromEntries(output.trim().split("\n").map((line) => {
    const separator = line.indexOf("=");
    const name = line.slice(0, separator);
    const encoded = line.slice(separator + 1);
    return [name, JSON.parse(encoded)];
  }));
}

command("supabase", ["start"]);
command("supabase", ["db", "reset", "--local"]);
const local = parseEnv(command("supabase", ["status", "-o", "env"]));
// `db reset` restarts Auth with a new container IP while the local gateway can retain its old
// upstream resolution. Restarting only the disposable local gateway makes the full Auth path
// deterministic without touching any other Supabase project on the machine.
command("docker", ["restart", "supabase_kong_car-hunt"]);
command("curl", ["--fail", "--silent", "--show-error", "--retry", "10", "--retry-all-errors", "--retry-delay", "1", `${local.API_URL}/auth/v1/health`]);

const result = spawnSync(process.execPath, ["./node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DATABASE_URL: local.DB_URL,
    DATABASE_SSL_MODE: "disable",
    NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
    MAILPIT_URL: local.MAILPIT_URL,
    APP_URL: "http://127.0.0.1:3100",
    APP_NAME: "AutoHunter",
    SEARCH_LOCATION_LABEL: "Doylestown, PA",
    ACTION_SIGNING_SECRET: "e2e-action-signing-secret-32-characters",
    INGEST_SECRET: "e2e-ingest-secret",
    CRON_SECRET: "e2e-cron-secret",
    PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3100",
  },
  stdio: "inherit",
});

process.exit(result.status ?? 1);
