import test from "node:test";
import assert from "node:assert/strict";
import { runGogEmailCycle } from "../src/gog-email-cycle.mjs";

const ORIGIN = "https://autohunter.northglass.io";
const SECRET = "collector-secret-collector-secret";

function recordingFetch({ configResponse, ingestResponse }) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/api/collector/config")) {
      const result = typeof configResponse === "function" ? configResponse() : configResponse;
      if (result instanceof Error) throw result;
      return result;
    }
    const result = typeof ingestResponse === "function" ? ingestResponse() : ingestResponse;
    if (result instanceof Error) throw result;
    return result;
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function ingestBodies(fetchImpl) {
  return fetchImpl.calls
    .filter((call) => call.url.endsWith("/api/ingest"))
    .map((call) => JSON.parse(call.options.body));
}

function validConfigResponse() {
  return new Response(JSON.stringify({ version: 2, searches: [] }), { status: 200 });
}

function acceptedResponse(accepted = 0) {
  return new Response(JSON.stringify({ accepted }), { status: 200 });
}

function assertFailedRun(run, messageCode) {
  assert.equal(run.adapter, "gog-authorized-email-v1");
  assert.equal(run.source, "email_alert");
  assert.equal(run.status, "failed");
  assert.equal(run.searchedCount, 0);
  assert.equal(run.discoveredCount, 0);
  assert.equal(run.acceptedCount, 0);
  assert.equal(run.messageCode, messageCode);
  assert.ok(!Number.isNaN(Date.parse(run.startedAt)));
  assert.ok(!Number.isNaN(Date.parse(run.finishedAt)));
}

test("posts a failure-visible source run when the collector config fetch fails", async () => {
  const fetchImpl = recordingFetch({
    configResponse: () => new Response("{}", { status: 401 }),
    ingestResponse: () => acceptedResponse(),
  });
  let gogInvoked = false;
  const execFileImpl = async () => {
    gogInvoked = true;
    throw new Error("must not be reached");
  };

  await assert.rejects(
    runGogEmailCycle({ appUrl: ORIGIN, ingestSecret: SECRET, fetchImpl, execFileImpl }),
    /HTTP 401/,
  );

  assert.equal(gogInvoked, false, "Gmail retrieval must not run without collector config");
  const bodies = ingestBodies(fetchImpl);
  assert.equal(bodies.length, 1);
  assert.deepEqual(bodies[0].candidates, []);
  assert.equal(bodies[0].sourceRuns.length, 1);
  assertFailedRun(bodies[0].sourceRuns[0], "collector_config_failed");
});

test("posts a failure-visible source run when the Keychain read fails", async () => {
  const fetchImpl = recordingFetch({
    configResponse: validConfigResponse,
    ingestResponse: () => acceptedResponse(),
  });
  const execFileImpl = async () => {
    throw new Error("keychain locked");
  };

  await assert.rejects(
    runGogEmailCycle({ appUrl: ORIGIN, ingestSecret: SECRET, fetchImpl, execFileImpl }),
    /Gmail alert retrieval failed/,
  );

  const bodies = ingestBodies(fetchImpl);
  assert.equal(bodies.length, 1);
  assertFailedRun(bodies[0].sourceRuns[0], "gmail_retrieval_failed");
});

test("posts a failure-visible source run when the gog executable fails", async () => {
  const fetchImpl = recordingFetch({
    configResponse: validConfigResponse,
    ingestResponse: () => acceptedResponse(),
  });
  const execFileImpl = async (command) => {
    if (command === "/usr/bin/security") return { stdout: "keyring-password-value\n" };
    throw new Error("gog exited 1");
  };

  await assert.rejects(
    runGogEmailCycle({ appUrl: ORIGIN, ingestSecret: SECRET, fetchImpl, execFileImpl }),
    /Gmail alert retrieval failed/,
  );

  const bodies = ingestBodies(fetchImpl);
  assert.equal(bodies.length, 1);
  assertFailedRun(bodies[0].sourceRuns[0], "gmail_retrieval_failed");
});

test("keeps the original error when the failure report cannot be delivered", async () => {
  const fetchImpl = recordingFetch({
    configResponse: () => new Response("{}", { status: 401 }),
    ingestResponse: () => new Error("ingest unreachable"),
  });

  await assert.rejects(
    runGogEmailCycle({
      appUrl: ORIGIN,
      ingestSecret: SECRET,
      fetchImpl,
      execFileImpl: async () => ({ stdout: "" }),
    }),
    /HTTP 401/,
  );

  const bodies = ingestBodies(fetchImpl);
  assert.equal(bodies.length, 1, "the failure report must still be attempted");
  assertFailedRun(bodies[0].sourceRuns[0], "collector_config_failed");
});

test("does not post an extra failure run on a successful empty cycle", async () => {
  const fetchImpl = recordingFetch({
    configResponse: validConfigResponse,
    ingestResponse: () => acceptedResponse(),
  });
  const execFileImpl = async (command) => {
    if (command === "/usr/bin/security") return { stdout: "keyring-password-value\n" };
    return { stdout: "[]" };
  };

  const result = await runGogEmailCycle({ appUrl: ORIGIN, ingestSecret: SECRET, fetchImpl, execFileImpl });

  assert.deepEqual(result, { messages: 0, accepted: 0, status: "empty" });
  const bodies = ingestBodies(fetchImpl);
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].sourceRuns.length, 1);
  assert.equal(bodies[0].sourceRuns[0].status, "empty");
});
