import { execFileSync, spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

import { resetLocalSupabase, startLocalSupabase } from "./local-supabase.mjs";

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

startLocalSupabase(command);
resetLocalSupabase(command);
const local = parseEnv(command("supabase", ["status", "-o", "env"]));
// `db reset` restarts Auth with a new container IP while the local gateway can retain its old
// upstream resolution. Restarting only the disposable local gateway makes the full Auth path
// deterministic without touching any other Supabase project on the machine.
command("docker", ["restart", "supabase_kong_car-hunt"]);
command("curl", ["--fail", "--silent", "--show-error", "--retry", "10", "--retry-all-errors", "--retry-delay", "1", `${local.API_URL}/auth/v1/health`]);
await provisionE2eAuth(local);

// Port 3100 by default. Set E2E_PORT when another local service already holds it.
const port = process.env.E2E_PORT ?? "3100";
const appUrl = `http://127.0.0.1:${port}`;

const result = spawnSync(process.execPath, ["./node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DATABASE_URL: local.DB_URL,
    DATABASE_SSL_MODE: "disable",
    NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: local.SECRET_KEY,
    MAILPIT_URL: local.MAILPIT_URL,
    APP_URL: appUrl,
    APP_NAME: "AutoHunter",
    SEARCH_LOCATION_LABEL: "Doylestown, PA",
    ACTION_SIGNING_SECRET: "e2e-action-signing-secret-32-characters",
    INGEST_SECRET: "e2e-ingest-secret-at-least-32-characters",
    CRON_SECRET: "e2e-cron-secret",
    PLAYWRIGHT_BASE_URL: appUrl,
    E2E_PORT: port,
  },
  stdio: "inherit",
});

process.exit(result.status ?? 1);

async function provisionE2eAuth(local) {
  if (!local.SECRET_KEY) throw new Error("local Supabase did not report its server-only secret key");
  const database = postgres(local.DB_URL, { max: 1, prepare: false });
  const admin = createClient(local.API_URL, local.SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  try {
    const profiles = await database`
      select id::text, email
      from catcht.user_profiles
      where active and email in ('admin@example.test', 'member@example.test')
      order by email
    `;
    if (profiles.length !== 2) throw new Error("local Auth fixtures are missing their reserved profiles");

    for (const profile of profiles) {
      const created = await admin.auth.admin.createUser({
        id: profile.id,
        email: profile.email,
        email_confirm: true,
      });
      let user = created.data.user;
      if (created.error || !user) {
        const existing = await admin.auth.admin.getUserById(profile.id);
        if (existing.error) throw existing.error;
        user = existing.data.user;
      }
      if (user.id !== profile.id || user.email?.toLowerCase() !== profile.email) {
        throw new Error("local Auth fixture did not match its reserved profile identity");
      }
      const bound = await database`
        update catcht.user_profiles
        set auth_user_id = ${profile.id}::uuid, updated_at = now()
        where id = ${profile.id}::uuid and lower(email) = ${profile.email}
        returning id
      `;
      if (bound.length !== 1) throw new Error("local Auth fixture could not be bound");
    }
  } finally {
    await database.end({ timeout: 1 });
  }
}
