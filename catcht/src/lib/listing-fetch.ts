import "server-only";
import { parseVehicleJsonLd } from "./source-parser";
import { sourceForUrl } from "./source-hosts";
import { browserFallbackForStatus } from "./scrape-status";

export class BrowserRequiredError extends Error {
  readonly code = "browser_required";
}

const MAX_HTML_BYTES = 5_000_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function limitedText(response: Response, source: string) {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_HTML_BYTES) throw new Error(`${source} listing page is too large`);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error(`${source} listing page is too large`);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export async function fetchPublicListing(rawUrl: string) {
  let currentUrl = new URL(rawUrl).toString();
  let source = sourceForUrl(currentUrl);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await fetch(currentUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "AutoHunter/1.0 (bounded vehicle research)",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    if (REDIRECT_STATUSES.has(response.status)) {
      if (redirects === 5) throw new Error(`${source} listing redirected too many times`);
      const location = response.headers.get("location");
      if (!location) throw new Error(`${source} redirect has no location`);
      currentUrl = new URL(location, currentUrl).toString();
      source = sourceForUrl(currentUrl);
      continue;
    }
    if (!response.ok) {
      const message = `${source} returned HTTP ${response.status}`;
      if (browserFallbackForStatus(response.status)) throw new BrowserRequiredError(message);
      throw new Error(message);
    }
    const finalUrl = response.url || currentUrl;
    source = sourceForUrl(finalUrl);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) throw new Error(`${source} returned non-HTML content`);
    const html = await limitedText(response, source);
    const vehicle = parseVehicleJsonLd(html);
    if (!vehicle) throw new Error(`${source} listing has no usable Vehicle JSON-LD`);
    return { source, url: finalUrl, vehicle };
  }
  throw new Error("listing redirect limit exceeded");
}
