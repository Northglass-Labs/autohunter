import test from "node:test";
import assert from "node:assert/strict";
import { readBoundedJson, validatedAppOrigin } from "../src/app-client.mjs";

test("accepts a production HTTPS origin and loopback development origins", () => {
  assert.equal(validatedAppOrigin("https://autohunter.northglass.io"), "https://autohunter.northglass.io");
  assert.equal(validatedAppOrigin("http://127.0.0.1:3000"), "http://127.0.0.1:3000");
});

test("rejects origins that could redirect bearer credentials outside AutoHunter", () => {
  for (const value of [
    "http://autohunter.northglass.io",
    "https://user:password@autohunter.northglass.io",
    "https://autohunter.northglass.io/elsewhere",
    "https://autohunter.northglass.io?next=https://evil.example",
    "not a url",
  ]) {
    assert.throws(() => validatedAppOrigin(value), /application origin/i, value);
  }
});

test("parses bounded JSON and rejects oversized responses before parsing", async () => {
  await assert.doesNotReject(async () => {
    const value = await readBoundedJson(new Response('{"ok":true}'), 64);
    assert.deepEqual(value, { ok: true });
  });

  await assert.rejects(
    readBoundedJson(new Response(JSON.stringify({ value: "x".repeat(100) })), 32),
    /too large/i,
  );
});
