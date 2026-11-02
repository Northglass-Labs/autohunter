import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const LOCAL_SUPABASE_NETWORK = "autohunter-loopback";

const HOST_BINDING_OPTION = "com.docker.network.bridge.host_binding_ipv4";
const PROJECT_DATABASE_CONTAINER = "supabase_db_car-hunt";
const PROJECT_CONTAINER_FILTER = "name=car-hunt";

function command(binary, args) {
  return execFileSync(binary, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function ensureLoopbackNetwork(run = command) {
  const networks = run("docker", [
    "network",
    "ls",
    "--filter",
    `name=^${LOCAL_SUPABASE_NETWORK}$`,
    "--format",
    "{{.Name}}",
  ]).trim().split("\n").filter(Boolean);

  if (!networks.includes(LOCAL_SUPABASE_NETWORK)) {
    run("docker", [
      "network",
      "create",
      "-o",
      `${HOST_BINDING_OPTION}=127.0.0.1`,
      LOCAL_SUPABASE_NETWORK,
    ]);
    return LOCAL_SUPABASE_NETWORK;
  }

  const hostBinding = run("docker", [
    "network",
    "inspect",
    "--format",
    `{{ index .Options "${HOST_BINDING_OPTION}" }}`,
    LOCAL_SUPABASE_NETWORK,
  ]).trim();

  if (hostBinding !== "127.0.0.1") {
    throw new Error(
      `Docker network ${LOCAL_SUPABASE_NETWORK} is not loopback-bound; refusing to start local Supabase`,
    );
  }

  return LOCAL_SUPABASE_NETWORK;
}

function activeDatabaseNetworks(run) {
  const containers = run("docker", [
    "container",
    "ls",
    "--all",
    "--filter",
    `name=^/${PROJECT_DATABASE_CONTAINER}$`,
    "--format",
    "{{.Names}}",
  ]).trim().split("\n").filter(Boolean);

  if (!containers.includes(PROJECT_DATABASE_CONTAINER)) return [];

  const output = run("docker", [
    "container",
    "inspect",
    "--format",
    "{{json .NetworkSettings.Networks}}",
    PROJECT_DATABASE_CONTAINER,
  ]);
  return Object.keys(JSON.parse(output));
}

function assertLoopbackPublishedPorts(run) {
  const names = run("docker", [
    "ps",
    "--filter",
    PROJECT_CONTAINER_FILTER,
    "--format",
    "{{.Names}}",
  ]).trim().split("\n").filter(Boolean);

  if (names.length === 0) {
    throw new Error("local Supabase reported success but no AutoHunter containers are running");
  }

  const exposed = [];
  for (const name of names) {
    const bindings = run("docker", ["port", name]).trim().split("\n").filter(Boolean);
    for (const binding of bindings) {
      if (!/-> (?:127\.0\.0\.1|\[::1\]):\d+$/.test(binding)) {
        exposed.push(name);
      }
    }
  }

  if (exposed.length > 0) {
    throw new Error(
      `local Supabase created non-loopback port bindings (${exposed.join(", ")}); stack was stopped`,
    );
  }
}

export function startLocalSupabase(run = command) {
  ensureLoopbackNetwork(run);

  const networks = activeDatabaseNetworks(run);
  if (networks.length > 0 && !networks.includes(LOCAL_SUPABASE_NETWORK)) {
    // `supabase stop` preserves the project's local Docker volumes by default.
    run("supabase", ["stop"]);
  }

  run("supabase", ["start", "--network-id", LOCAL_SUPABASE_NETWORK]);
  try {
    assertLoopbackPublishedPorts(run);
  } catch (error) {
    run("supabase", ["stop"]);
    throw error;
  }
}

export function resetLocalSupabase(run = command) {
  run("supabase", [
    "db",
    "reset",
    "--local",
    "--network-id",
    LOCAL_SUPABASE_NETWORK,
  ]);
}

export function testLocalSupabase(run = command) {
  return run("supabase", [
    "test",
    "db",
    "--network-id",
    LOCAL_SUPABASE_NETWORK,
  ]);
}

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    startLocalSupabase();
    process.stdout.write("AutoHunter local Supabase is running on loopback-only published ports.\n");
  } catch (error) {
    const summary = error instanceof Error ? error.message.split("\n", 1)[0] : "unknown error";
    process.stderr.write(`Local Supabase start failed: ${summary}\n`);
    process.exitCode = 1;
  }
}
