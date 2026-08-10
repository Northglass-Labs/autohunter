import assert from "node:assert/strict";
import test from "node:test";

import { requestDigest } from "../src/digest.mjs";

test("requests the canonical digest route with a bearer secret and bounded JSON", async () => {
  let request;
  const result = await requestDigest({
    env: {
      AUTOHUNTER_APP_URL: "https://autohunter.northglass.io",
      AUTOHUNTER_CRON_SECRET: "synthetic-cron-secret",
    },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ status: "sent", sentCount: 1 }));
    },
  });

  assert.equal(request.url, "https://autohunter.northglass.io/api/cron/digest");
  assert.equal(request.options.headers.Authorization, "Bearer synthetic-cron-secret");
  assert.deepEqual(result, { status: "sent", sentCount: 1 });
});

test("fails closed without both the application origin and cron secret", async () => {
  await assert.rejects(
    requestDigest({ env: { AUTOHUNTER_APP_URL: "https://autohunter.northglass.io" } }),
    /AUTOHUNTER_APP_URL and AUTOHUNTER_CRON_SECRET/,
  );
  await assert.rejects(
    requestDigest({ env: { AUTOHUNTER_CRON_SECRET: "synthetic-cron-secret" } }),
    /AUTOHUNTER_APP_URL and AUTOHUNTER_CRON_SECRET/,
  );
});

test("contains an unsuccessful digest response without echoing its body", async () => {
  await assert.rejects(
    requestDigest({
      env: {
        AUTOHUNTER_APP_URL: "https://autohunter.northglass.io",
        AUTOHUNTER_CRON_SECRET: "synthetic-cron-secret",
      },
      fetchImpl: async () => new Response("provider detail that must stay private", { status: 503 }),
    }),
    { message: "digest endpoint returned HTTP 503" },
  );
});
