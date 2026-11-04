import { Buffer } from "node:buffer";
import { createSign, generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index";

const endpoint =
  "https://ebay-account-deletion.tom-c-stetson.workers.dev/.well-known/ebay-deletion";
const testToken = "local-test-verification-token";
const env = {
  EBAY_CLIENT_ID: "local-client-id",
  EBAY_CLIENT_SECRET: "local-client-secret",
  EBAY_DELETION_VERIFICATION_TOKEN: testToken,
};
const keyId = "test-key-2026";
const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

class MemoryCache {
  readonly entries = new Map<string, Response>();

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    return this.entries.get(new Request(request).url)?.clone();
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    this.entries.set(new Request(request).url, response.clone());
  }
}

let cache: MemoryCache;

beforeEach(() => {
  cache = new MemoryCache();
  vi.stubGlobal("caches", { default: cache });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function signatureHeader(payload: string, signingKey = privateKey, kid = keyId): string {
  const signer = createSign("SHA1");
  signer.update(Buffer.from(payload, "utf8"));
  signer.end();
  return Buffer.from(JSON.stringify({
    alg: "ecdsa",
    kid,
    signature: signer.sign(signingKey).toString("base64"),
    digest: "SHA1",
  })).toString("base64");
}

function notificationRequest(payload: string, signature = signatureHeader(payload)): Request {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      "cf-ray": "request-id-for-test",
      "content-type": "application/json",
      "x-ebay-signature": signature,
    },
    body: payload,
  });
}

function mockEbayPublicKey(
  response: Response = Response.json({ key: publicKey.replaceAll("\n", "") }),
  expectedKeyId = keyId,
) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    expect(url.origin).toBe("https://api.ebay.com");
    if (url.pathname === "/identity/v1/oauth2/token") {
      expect(request.method).toBe("POST");
      expect(request.headers.get("authorization")).toBe("Basic bG9jYWwtY2xpZW50LWlkOmxvY2FsLWNsaWVudC1zZWNyZXQ=");
      return Response.json({ access_token: "local-application-token", expires_in: 7200 });
    }
    if (url.pathname === `/commerce/notification/v1/public_key/${expectedKeyId}`) {
      expect(request.headers.get("authorization")).toBe("Bearer local-application-token");
      return response.clone();
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
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

  it("keeps the GET challenge independent from POST-only eBay API credentials", async () => {
    const challenge = "challenge-without-oauth";
    const response = await worker.fetch(
      new Request(`${endpoint}?challenge_code=${challenge}`),
      {
        EBAY_CLIENT_ID: "",
        EBAY_CLIENT_SECRET: "",
        EBAY_DELETION_VERIFICATION_TOKEN: testToken,
      },
    );

    expect(response.status).toBe(200);
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

  it("verifies the signature over the exact raw bytes and logs no payload data", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const payload = '{\n  "notification": { "notificationId": "sensitive-id" }\n}\n';
    const signature = signatureHeader(payload);
    mockEbayPublicKey();

    const response = await worker.fetch(notificationRequest(payload, signature), env);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(log).toHaveBeenCalledOnce();
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toContain('"outcome":"verified"');
    expect(logged).toContain('"request_id":"request-id-for-test"');
    expect(logged).not.toContain("sensitive-id");
    expect(logged).not.toContain(signature);
  });

  it("rejects a forged signature with 412", async () => {
    const { privateKey: attackerKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const payload = '{"notification":{"notificationId":"forged"}}';
    mockEbayPublicKey();

    const response = await worker.fetch(
      notificationRequest(payload, signatureHeader(payload, attackerKey)),
      env,
    );

    expect(response.status).toBe(412);
  });

  it("rejects replaying a valid signature against different raw bytes", async () => {
    const original = '{"notification":{"notificationId":"original"}}';
    const changed = '{"notification":{"notificationId":"changed"}}';
    mockEbayPublicKey();

    const response = await worker.fetch(
      notificationRequest(changed, signatureHeader(original)),
      env,
    );

    expect(response.status).toBe(412);
  });

  it("accepts an exact signed redelivery because processing is idempotent", async () => {
    const payload = '{"notification":{"notificationId":"retry"}}';
    const signature = signatureHeader(payload);
    const fetchMock = mockEbayPublicKey();

    const first = await worker.fetch(notificationRequest(payload, signature), env);
    const second = await worker.fetch(notificationRequest(payload, signature), env);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a missing signature with 412 without fetching a key", async () => {
    const fetchMock = mockEbayPublicKey();
    const response = await worker.fetch(new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }), env);

    expect(response.status).toBe(412);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["rsa", "SHA1"],
    ["ecdsa", "SHA256"],
  ])("rejects an unsupported %s/%s signature envelope without fetching a key", async (alg, digest) => {
    const fetchMock = mockEbayPublicKey();
    const signature = Buffer.from(JSON.stringify({
      alg,
      digest,
      kid: keyId,
      signature: Buffer.from("not-used").toString("base64"),
    })).toString("base64");

    const response = await worker.fetch(notificationRequest("{}", signature), env);

    expect(response.status).toBe(412);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized body before buffering it or fetching a key", async () => {
    const fetchMock = mockEbayPublicKey();
    const response = await worker.fetch(notificationRequest("x".repeat(65_537)), env);

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown public-key id with 412", async () => {
    mockEbayPublicKey(new Response(null, { status: 404 }));
    const payload = '{"notification":{"notificationId":"unknown-key"}}';

    const response = await worker.fetch(notificationRequest(payload), env);

    expect(response.status).toBe(412);
  });

  it("rejects invalid public-key material with 412 and does not cache it", async () => {
    mockEbayPublicKey(Response.json({ key: "not a public key" }));
    const payload = '{"notification":{"notificationId":"invalid-key"}}';

    const response = await worker.fetch(notificationRequest(payload), env);

    expect(response.status).toBe(412);
    expect(cache.entries.size).toBe(0);
  });

  it("returns 503 when the eBay key service is unavailable so delivery can retry", async () => {
    mockEbayPublicKey(new Response(null, { status: 503 }));
    const payload = '{"notification":{"notificationId":"retry-key"}}';

    const response = await worker.fetch(notificationRequest(payload), env);

    expect(response.status).toBe(503);
  });

  it("returns 503 without fetching when POST-only eBay credentials are unavailable", async () => {
    const fetchMock = mockEbayPublicKey();
    const payload = '{"notification":{"notificationId":"missing-oauth"}}';

    const response = await worker.fetch(notificationRequest(payload), {
      ...env,
      EBAY_CLIENT_SECRET: "",
    });

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when the challenge secret binding is unavailable", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await worker.fetch(new Request(`${endpoint}?challenge_code=x`), {
      ...env,
      EBAY_DELETION_VERIFICATION_TOKEN: "",
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "configuration error" });
    expect(error).toHaveBeenCalledOnce();
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
