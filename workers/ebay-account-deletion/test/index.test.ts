import { describe, expect, it, vi } from "vitest";

import worker from "../src/index";

const endpoint =
  "https://ebay-account-deletion.tom-c-stetson.workers.dev/.well-known/ebay-deletion";
const testToken = "local-test-verification-token";
const env = { EBAY_DELETION_VERIFICATION_TOKEN: testToken };

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

describe("eBay marketplace account deletion callback", () => {
  it("returns eBay's SHA-256 challenge response for the exact endpoint URL", async () => {
    const challenge = "eBay challenge with spaces";
    const request = new Request(
      `${endpoint}?challenge_code=${encodeURIComponent(challenge)}`,
    );

    const response = await worker.fetch(request, env);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      challengeResponse: await sha256Hex(challenge + testToken + endpoint),
    });
  });

  it("rejects a challenge request without challenge_code", async () => {
    const response = await worker.fetch(new Request(endpoint), env);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "missing challenge_code",
    });
  });

  it("acknowledges deletion notifications without logging their body", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const body = JSON.stringify({ userId: "sensitive-user-id" });

    const response = await worker.fetch(
      new Request(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ebay-signature": "sensitive-signature",
        },
        body,
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(log).toHaveBeenCalledOnce();
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).not.toContain("sensitive-user-id");
    expect(logged).not.toContain("sensitive-signature");
    log.mockRestore();
  });

  it("fails closed when the secret binding is unavailable", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await worker.fetch(new Request(`${endpoint}?challenge_code=x`), {
      EBAY_DELETION_VERIFICATION_TOKEN: "",
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "configuration error" });
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it("returns 404 outside the configured well-known path", async () => {
    const response = await worker.fetch(
      new Request("https://ebay-account-deletion.tom-c-stetson.workers.dev/"),
      env,
    );

    expect(response.status).toBe(404);
  });

  it("returns 405 and an Allow header for unsupported methods", async () => {
    const response = await worker.fetch(
      new Request(endpoint, { method: "DELETE" }),
      env,
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, POST");
  });
});
