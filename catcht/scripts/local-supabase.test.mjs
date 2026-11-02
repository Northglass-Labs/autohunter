import { describe, expect, it } from "vitest";

import {
  LOCAL_SUPABASE_NETWORK,
  ensureLoopbackNetwork,
  startLocalSupabase,
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
  it("starts Supabase on an existing loopback-bound Docker network", () => {
    const { calls, run } = recorder([
      "127.0.0.1\n",
      JSON.stringify({ [LOCAL_SUPABASE_NETWORK]: {} }),
      "started\n",
      "supabase_kong_car-hunt\n",
      "8000/tcp -> 127.0.0.1:55421\n",
    ]);

    startLocalSupabase(run);

    expect(calls).toEqual([
      ["docker", ["network", "inspect", "--format", expect.any(String), LOCAL_SUPABASE_NETWORK]],
      ["docker", ["container", "inspect", "--format", expect.any(String), "supabase_db_car-hunt"]],
      ["supabase", ["start", "--network-id", LOCAL_SUPABASE_NETWORK]],
      ["docker", ["ps", "--filter", expect.any(String), "--format", "{{.Names}}"]],
      ["docker", ["port", "supabase_kong_car-hunt"]],
    ]);
  });

  it("creates the loopback-bound network when it is absent", () => {
    const missing = Object.assign(new Error("network missing"), {
      status: 1,
      stderr: "Error: No such network: autohunter-loopback",
    });
    const containerMissing = Object.assign(new Error("container missing"), {
      status: 1,
      stderr: "Error: No such object: supabase_db_car-hunt",
    });
    const { calls, run } = recorder([
      missing,
      "created\n",
      containerMissing,
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
      ["container", "inspect", "--format", expect.any(String), "supabase_db_car-hunt"],
    ]);
    expect(calls[3]).toEqual(["supabase", ["start", "--network-id", LOCAL_SUPABASE_NETWORK]]);
  });

  it("stops an active stack before moving it off an insecure network", () => {
    const { calls, run } = recorder([
      "127.0.0.1\n",
      JSON.stringify({ "supabase_network_car-hunt": {} }),
      "stopped\n",
      "started\n",
      "supabase_db_car-hunt\n",
      "5432/tcp -> 127.0.0.1:55422\n",
    ]);

    startLocalSupabase(run);

    expect(calls.slice(2, 4)).toEqual([
      ["supabase", ["stop"]],
      ["supabase", ["start", "--network-id", LOCAL_SUPABASE_NETWORK]],
    ]);
  });

  it("refuses an existing network with a non-loopback host binding", () => {
    const { calls, run } = recorder(["0.0.0.0\n"]);

    expect(() => ensureLoopbackNetwork(run)).toThrow(/not loopback-bound/);
    expect(calls).toHaveLength(1);
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
    const containerMissing = Object.assign(new Error("container missing"), {
      status: 1,
      stderr: "Error: No such object: supabase_db_car-hunt",
    });
    const { calls, run } = recorder([
      "127.0.0.1\n",
      containerMissing,
      "started\n",
      "supabase_kong_car-hunt\n",
      "8000/tcp -> 0.0.0.0:55421\n8000/tcp -> [::]:55421\n",
      "stopped\n",
    ]);

    expect(() => startLocalSupabase(run)).toThrow(/non-loopback/);
    expect(calls.at(-1)).toEqual(["supabase", ["stop"]]);
  });
});
