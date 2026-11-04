const CALLBACK_PATH = "/.well-known/ebay-deletion";
const EBAY_API_ORIGIN = "https://api.ebay.com";
const EBAY_OAUTH_SCOPE = "https://api.ebay.com/oauth/api_scope";
const MAX_NOTIFICATION_BYTES = 64 * 1024;
const MAX_SIGNATURE_HEADER_CHARS = 4 * 1024;
const MAX_UPSTREAM_RESPONSE_BYTES = 16 * 1024;
const PUBLIC_KEY_CACHE_SECONDS = 60 * 60;

type VerificationOutcome =
  | "verified"
  | "invalid_content_type"
  | "invalid_public_key"
  | "invalid_signature"
  | "invalid_signature_header"
  | "key_service_unavailable"
  | "missing_signature"
  | "notification_too_large"
  | "unknown_public_key";

class VerificationFailure extends Error {
  constructor(
    readonly status: number,
    readonly outcome: VerificationOutcome,
  ) {
    super(outcome);
    this.name = "VerificationFailure";
  }
}

interface SignatureEnvelope {
  kid: string;
  signature: Uint8Array;
}

interface ValidatedPublicKey {
  pem: string;
  key: CryptoKey;
}

function jsonResponse(body: object, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function requestId(request: Request): string {
  const candidate = request.headers.get("cf-ray");
  return candidate && /^[A-Za-z0-9-]{1,128}$/.test(candidate)
    ? candidate
    : crypto.randomUUID();
}

function logVerification(outcome: VerificationOutcome, id: string): void {
  console.log(JSON.stringify({
    event: "ebay_account_deletion_notification_verification",
    outcome,
    request_id: id,
  }));
}

function decodeBase64(value: string, maximumBytes: number): Uint8Array {
  if (
    value.length === 0
    || value.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new Error("invalid base64");
  }
  const binary = atob(value);
  if (binary.length === 0 || binary.length > maximumBytes) {
    throw new Error("decoded value is outside its size bound");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function parseSignatureHeader(value: string | null): SignatureEnvelope {
  if (!value) throw new VerificationFailure(412, "missing_signature");
  if (value.length > MAX_SIGNATURE_HEADER_CHARS) {
    throw new VerificationFailure(412, "invalid_signature_header");
  }

  try {
    const decoded = decodeBase64(value, 2 * 1024);
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(decoded));
    if (!parsed || typeof parsed !== "object") throw new Error("signature envelope is not an object");
    const algorithm = "alg" in parsed ? parsed.alg : undefined;
    const digest = "digest" in parsed ? parsed.digest : undefined;
    const kid = "kid" in parsed ? parsed.kid : undefined;
    const signature = "signature" in parsed ? parsed.signature : undefined;
    if (algorithm !== "ecdsa" || digest !== "SHA1") {
      throw new Error("unsupported signature algorithm");
    }
    if (typeof kid !== "string" || !/^[A-Za-z0-9._-]{1,200}$/.test(kid)) {
      throw new Error("invalid key id");
    }
    if (typeof signature !== "string") throw new Error("invalid signature");
    return { kid, signature: decodeBase64(signature, 256) };
  } catch (error) {
    if (error instanceof VerificationFailure) throw error;
    throw new VerificationFailure(412, "invalid_signature_header");
  }
}

async function readBoundedStream(
  stream: ReadableStream<Uint8Array> | null,
  declaredLength: string | null,
  maximumBytes: number,
  failure: VerificationFailure,
): Promise<Uint8Array> {
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0 || length > maximumBytes) throw failure;
  }
  if (!stream) return new Uint8Array();

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximumBytes) {
      await reader.cancel();
      throw failure;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const bytes = await readBoundedStream(
    response.body,
    response.headers.get("content-length"),
    MAX_UPSTREAM_RESPONSE_BYTES,
    new VerificationFailure(503, "key_service_unavailable"),
  );
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    throw new VerificationFailure(503, "key_service_unavailable");
  }
}

async function validatedEcPublicKey(payload: unknown): Promise<ValidatedPublicKey> {
  try {
    if (!payload || typeof payload !== "object" || !("key" in payload) || typeof payload.key !== "string") {
      throw new Error("missing key");
    }
    const value = payload.key.trim();
    const match = value.match(/^-----BEGIN PUBLIC KEY-----\s*([A-Za-z0-9+/=\s]+?)\s*-----END PUBLIC KEY-----$/);
    if (!match) throw new Error("not an SPKI public key");
    const encoded = match[1].replaceAll(/\s/g, "");
    const der = decodeBase64(encoded, 2 * 1024);
    const key = await crypto.subtle.importKey(
      "spki",
      der,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const wrapped = encoded.match(/.{1,64}/g)?.join("\n");
    if (!wrapped) throw new Error("empty key");
    return {
      pem: `-----BEGIN PUBLIC KEY-----\n${wrapped}\n-----END PUBLIC KEY-----\n`,
      key,
    };
  } catch {
    throw new VerificationFailure(412, "invalid_public_key");
  }
}

function publicKeyCacheRequest(kid: string): Request {
  return new Request(`https://ebay-public-key-cache.invalid/${encodeURIComponent(kid)}`);
}

async function ebayApplicationToken(env: Env): Promise<string> {
  if (!env.EBAY_CLIENT_ID || !env.EBAY_CLIENT_SECRET) {
    throw new VerificationFailure(503, "key_service_unavailable");
  }
  let response: Response;
  try {
    response = await fetch(`${EBAY_API_ORIGIN}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${encodeBase64(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`)}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: EBAY_OAUTH_SCOPE,
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new VerificationFailure(503, "key_service_unavailable");
  }
  if (!response.ok) throw new VerificationFailure(503, "key_service_unavailable");
  const payload = await readBoundedJson(response);
  if (
    !payload
    || typeof payload !== "object"
    || !("access_token" in payload)
    || typeof payload.access_token !== "string"
    || payload.access_token.length < 1
    || payload.access_token.length > 8 * 1024
  ) {
    throw new VerificationFailure(503, "key_service_unavailable");
  }
  return payload.access_token;
}

async function ebayPublicKey(kid: string, env: Env): Promise<CryptoKey> {
  const cacheRequest = publicKeyCacheRequest(kid);
  const cached = await caches.default.match(cacheRequest);
  if (cached) return (await validatedEcPublicKey(await readBoundedJson(cached))).key;

  const token = await ebayApplicationToken(env);
  let response: Response;
  try {
    response = await fetch(
      `${EBAY_API_ORIGIN}/commerce/notification/v1/public_key/${encodeURIComponent(kid)}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(5_000),
      },
    );
  } catch {
    throw new VerificationFailure(503, "key_service_unavailable");
  }
  if (response.status === 404) throw new VerificationFailure(412, "unknown_public_key");
  if (!response.ok) throw new VerificationFailure(503, "key_service_unavailable");

  const validated = await validatedEcPublicKey(await readBoundedJson(response));
  await caches.default.put(cacheRequest, Response.json(
    { key: validated.pem },
    { headers: { "cache-control": `public, max-age=${PUBLIC_KEY_CACHE_SECONDS}` } },
  ));
  return validated.key;
}

function derLength(bytes: Uint8Array, offset: number): [length: number, offset: number] {
  const first = bytes[offset];
  if (first === undefined) throw new Error("missing DER length");
  if ((first & 0x80) === 0) return [first, offset + 1];

  const lengthBytes = first & 0x7f;
  if (lengthBytes === 0 || lengthBytes > 2 || offset + 1 + lengthBytes > bytes.length) {
    throw new Error("invalid DER length");
  }
  let length = 0;
  for (let index = 0; index < lengthBytes; index += 1) {
    length = (length << 8) | bytes[offset + 1 + index];
  }
  if (length < 128) throw new Error("non-canonical DER length");
  return [length, offset + 1 + lengthBytes];
}

function derInteger(bytes: Uint8Array, offset: number): [value: Uint8Array, offset: number] {
  if (bytes[offset] !== 0x02) throw new Error("missing DER integer");
  const [length, valueOffset] = derLength(bytes, offset + 1);
  const end = valueOffset + length;
  if (length === 0 || end > bytes.length) throw new Error("invalid DER integer length");
  let value = bytes.slice(valueOffset, end);
  if ((value[0] & 0x80) !== 0) throw new Error("negative DER integer");
  while (value.length > 1 && value[0] === 0) value = value.slice(1);
  if (value.length > 32) throw new Error("DER integer is too large");
  return [value, end];
}

function derEcdsaSignatureToP1363(signature: Uint8Array): Uint8Array {
  if (signature[0] !== 0x30) throw new Error("missing DER sequence");
  const [sequenceLength, sequenceOffset] = derLength(signature, 1);
  if (sequenceOffset + sequenceLength !== signature.length) throw new Error("invalid DER sequence length");
  const [r, afterR] = derInteger(signature, sequenceOffset);
  const [s, afterS] = derInteger(signature, afterR);
  if (afterS !== signature.length) throw new Error("trailing DER data");

  const raw = new Uint8Array(64);
  raw.set(r, 32 - r.length);
  raw.set(s, 64 - s.length);
  return raw;
}

async function validSignature(payload: Uint8Array, signature: Uint8Array, key: CryptoKey): Promise<boolean> {
  try {
    // eBay's official notification SDK uses its legacy SHA-1/ECDSA protocol. The verifier is fed
    // the exact received bytes; parsing and re-serializing JSON would change the signed message.
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-1" },
      key,
      derEcdsaSignatureToP1363(signature),
      payload,
    );
  } catch {
    return false;
  }
}

async function handleNotification(request: Request, env: Env): Promise<Response> {
  const id = requestId(request);
  try {
    const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "application/json") {
      throw new VerificationFailure(412, "invalid_content_type");
    }
    const envelope = parseSignatureHeader(request.headers.get("x-ebay-signature"));
    const payload = await readBoundedStream(
      request.body,
      request.headers.get("content-length"),
      MAX_NOTIFICATION_BYTES,
      new VerificationFailure(413, "notification_too_large"),
    );
    const key = await ebayPublicKey(envelope.kid, env);
    if (!await validSignature(payload, envelope.signature, key)) {
      throw new VerificationFailure(412, "invalid_signature");
    }
    logVerification("verified", id);
    return emptyResponse(200);
  } catch (error) {
    if (error instanceof VerificationFailure) {
      logVerification(error.outcome, id);
      return emptyResponse(error.status);
    }
    throw error;
  }
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname !== CALLBACK_PATH) {
    return new Response("Not Found", { status: 404 });
  }

  if (!env.EBAY_DELETION_VERIFICATION_TOKEN) {
    console.error(JSON.stringify({
      event: "ebay_account_deletion_configuration_error",
      reason: "missing_secret_binding",
    }));
    return jsonResponse({ error: "configuration error" }, 500);
  }

  if (request.method === "GET") {
    const challenge = url.searchParams.get("challenge_code");
    if (!challenge) {
      return jsonResponse({ error: "missing challenge_code" }, 400);
    }

    const endpointUrl = url.origin + url.pathname;
    const input = new TextEncoder().encode(
      challenge + env.EBAY_DELETION_VERIFICATION_TOKEN + endpointUrl,
    );
    const digest = await crypto.subtle.digest("SHA-256", input);

    return jsonResponse({ challengeResponse: toHex(digest) }, 200);
  }

  if (request.method === "POST") return handleNotification(request, env);

  return new Response("Method Not Allowed", {
    status: 405,
    headers: { allow: "GET, POST" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error(JSON.stringify({
        event: "ebay_account_deletion_unhandled_error",
        error: error instanceof Error ? error.name : "UnknownError",
      }));
      return jsonResponse({ error: "internal error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
