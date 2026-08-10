import assert from "node:assert/strict";
import test from "node:test";
import { runCollection } from "../src/collect.mjs";

const AUTHORIZATION_ENV = "AUTOHUNTER_LEGACY_BROWSER_AUTHORIZATION";
const AUTHORIZATION_VALUE = "written-source-permission-confirmed";

test("legacy browser collection fails closed before reading config or launching a browser", async () => {
  const previous = process.env[AUTHORIZATION_ENV];
  delete process.env[AUTHORIZATION_ENV];
  try {
    await assert.rejects(
      runCollection({
        config: "/definitely-not-an-autohunter-config.json",
        dryRun: true,
        discoverOnly: true,
        json: true,
        limit: 1,
        model: null,
      }),
      /legacy browser collection is disabled/i,
    );
  } finally {
    if (previous === undefined) delete process.env[AUTHORIZATION_ENV];
    else process.env[AUTHORIZATION_ENV] = previous;
  }
});

test("the exact written-permission attestation preserves the migration path", async () => {
  const previous = process.env[AUTHORIZATION_ENV];
  process.env[AUTHORIZATION_ENV] = AUTHORIZATION_VALUE;
  try {
    await assert.rejects(
      runCollection({
        config: "/definitely-not-an-autohunter-config.json",
        dryRun: true,
        discoverOnly: true,
        json: true,
        limit: 1,
        model: null,
      }),
      /ENOENT/,
    );
  } finally {
    if (previous === undefined) delete process.env[AUTHORIZATION_ENV];
    else process.env[AUTHORIZATION_ENV] = previous;
  }
});
