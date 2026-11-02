import { describe, expect, it } from "vitest";

import {
  LOCAL_SUPABASE_NETWORK,
  ensureLoopbackNetwork,
  resetLocalSupabase,
  startLocalSupabase,
  testLocalSupabase,
} from "./local-supabase.mjs";

function recorder(responses = []) {
  const calls = [];
  const run = (binary, args) => {
    calls.push([binary, args]);
    const response = responses.shift();
    if (response instanceof Error) throw response;
    return response ?? "";
  };
  return { calls, run };
}

describe("loopback-bound local Supabase", () => {
  it("creates the loopback-bound network when an exact-name lookup is empty", () => {
    const { calls, run } = recorder(["\n", "created\n"]);

    expect(ensureLoopbackNetwork(run)).toBe(LOCAL_SUPABASE_NETWORK);
    expect(calls).toEqual([
      [
        "docker",
        [
          "network",
          "ls",
          "--filter",
          `name=^${LOCAL_SUPABASE_NETWORK}$`,
          "--format",
          "{{.Name}}",
        ],
      ],
      [
        "docker",
        [
          "network",
          "create",
          "-o",
          "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
          LOCAL_SUPABASE_NETWORK,
        ],
      ],
    ]);
  });

  it("starts Supabase on an existing loopback-bound Docker network", () => {
    const { calls, run } = recorder([
      `${LOCAL_SUPABASE_NETWORK}\n`,
      "127.0.0.1\n",
      "supabase_db_car-hunt\n",
      JSON.stringify({ [LOCAL_SUPABASE_NETWORK]: {} }),
      "started\n",
      "supabase_kong_car-hunt\n",
      "8000/tcp -> 127.0.0.1:55421\n",
    ]);

    startLocalSupabase(run);

    expect(calls).toEqual([
      [
        "docker",
        [
          "network",
          "ls",
          "--filter",
          `name=^${LOCAL_SUPABASE_NETWORK}$`,
          "--format",
          "{{.Name}}",
        ],
      ],
      ["docker", ["network", "inspect", "--format", expect.any(String), LOCAL_SUPABASE_NETWORK]],
      ["docker", ["container", "ls", "--all", "--filter", expect.any(String), "--format", "{{.Names}}"]],
      ["docker", ["container", "inspect", "--format", expect.any(String), "supabase_db_car-hunt"]],
      ["supabase", ["start", "--network-id", LOCAL_SUPABASE_NETWORK]],
      ["docker", ["ps", "--filter", expect.any(String), "--format", "{{.Names}}"]],
      ["docker", ["port", "supabase_kong_car-hunt"]],
    ]);
  });

  it("starts when the project database container is absent", () => {
    const { calls, run } = recorder([
      `${LOCAL_SUPABASE_NETWORK}\n`,
      "127.0.0.1\n",
      "\n",
      "started\n",
      "supabase_db_car-hunt\n",
      "5432/tcp -> 127.0.0.1:55422\n",
    ]);

    startLocalSupabase(run);

    expect(calls[2]).toEqual([
      "docker",
      [
        "container",
        "ls",
        "--all",
        "--filter",
        "name=^/supabase_db_car-hunt$",
        "--format",
        "{{.Names}}",
      ],
    ]);
    expect(calls).not.toContainEqual(["supabase", ["stop"]]);
    expect(calls).toContainEqual(["supabase", ["start", "--network-id", LOCAL_SUPABASE_NETWORK]]);
  });

  it("keeps the loopback network while resetting the local database", () => {
    const { calls, run } = recorder(["reset\n"]);

    resetLocalSupabase(run);

    expect(calls).toEqual([
      [
        "supabase",
        ["db", "reset", "--local", "--network-id", LOCAL_SUPABASE_NETWORK],
      ],
    ]);
  });

  it("runs pgTAP on the same loopback network", () => {
    const { calls, run } = recorder(["tests passed\n"]);

    testLocalSupabase(run);

    expect(calls).toEqual([
      ["supabase", ["test", "db", "--network-id", LOCAL_SUPABASE_NETWORK]],
    ]);
  });

  it("creates the loopback-bound network when it is absent", () => {
    const { calls, run } = recorder([
      "\n",
      "created\n",
      "\n",
      "started\n",
      "supabase_db_car-hunt\n",
      "5432/tcp -> 127.0.0.1:55422\n",
    ]);

    startLocalSupabase(run);

    expect(calls[1]).toEqual([
      "docker",
      [
        "network",
        "create",
        "-o",
        "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
        LOCAL_SUPABASE_NETWORK,
      ],
    ]);
    expect(calls[2]).toEqual([
      "docker",
      ["container", "ls", "--all", "--filter", expect.any(String), "--format", "{{.Names}}"],
    ]);
    expect(calls[3]).toEqual(["supabase", ["start", "--network-id", LOCAL_SUPABASE_NETWORK]]);
  });

  it("stops an active stack before moving it off an insecure network", () => {
    const { calls, run } = recorder([
      `${LOCAL_SUPABASE_NETWORK}\n`,
      "127.0.0.1\n",
      "supabase_db_car-hunt\n",
      JSON.stringify({ "supabase_network_car-hunt": {} }),
      "stopped\n",
      "started\n",
      "supabase_db_car-hunt\n",
      "5432/tcp -> 127.0.0.1:55422\n",
    ]);

    startLocalSupabase(run);

    expect(calls.slice(4, 6)).toEqual([
      ["supabase", ["stop"]],
      ["supabase", ["start", "--network-id", LOCAL_SUPABASE_NETWORK]],
    ]);
  });

  it("refuses an existing network with a non-loopback host binding", () => {
    const { calls, run } = recorder([`${LOCAL_SUPABASE_NETWORK}\n`, "0.0.0.0\n"]);

    expect(() => ensureLoopbackNetwork(run)).toThrow(/not loopback-bound/);
    expect(calls).toHaveLength(2);
  });

  it("does not mistake Docker access failures for a missing network", () => {
    const denied = Object.assign(new Error("Docker access denied"), {
      status: 1,
      stderr: "permission denied while trying to connect to the docker API",
    });
    const { calls, run } = recorder([denied]);

    expect(() => ensureLoopbackNetwork(run)).toThrow(/access denied/);
    expect(calls).toHaveLength(1);
  });

  it("stops the stack and refuses wildcard port publishing", () => {
    const { calls, run } = recorder([
      `${LOCAL_SUPABASE_NETWORK}\n`,
      "127.0.0.1\n",
      "\n",
      "started\n",
      "supabase_kong_car-hunt\n",
      "8000/tcp -> 0.0.0.0:55421\n8000/tcp -> [::]:55421\n",
      "stopped\n",
    ]);

    expect(() => startLocalSupabase(run)).toThrow(/non-loopback/);
    expect(calls.at(-1)).toEqual(["supabase", ["stop"]]);
  });
});
