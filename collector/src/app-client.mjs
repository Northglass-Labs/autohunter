const DEFAULT_MAXIMUM_JSON_BYTES = 1_048_576;

export function validatedAppOrigin(value) {
  try {
    const url = new URL(String(value));
    const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if ((url.protocol !== "https:" && !(loopback && url.protocol === "http:"))
      || url.username
      || url.password
      || url.pathname !== "/"
      || url.search
      || url.hash) {
      throw new Error();
    }
    return url.origin;
  } catch {
    throw new Error("AutoHunter application origin is invalid");
  }
}

export async function readBoundedJson(response, maximumBytes = DEFAULT_MAXIMUM_JSON_BYTES) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 16 * 1024 * 1024) {
    throw new Error("JSON response limit is invalid");
  }
  const declaredLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new Error("JSON response is too large");
  }
  if (!response.body?.getReader && typeof response.text === "function") {
    const value = await response.text();
    if (Buffer.byteLength(value, "utf8") > maximumBytes) throw new Error("JSON response is too large");
    return JSON.parse(value);
  }
  if (!response.body?.getReader && typeof response.json === "function") {
    const value = await response.json();
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > maximumBytes) throw new Error("JSON response is too large");
    return value;
  }
  if (!response.body?.getReader) throw new Error("JSON response body is unavailable");

  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) throw new Error("JSON response is too large");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
