import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { challengeDetected } from "./challenge.mjs";
import { authorizeNavigationUrl, authorizePublicResourceUrl } from "./source-policy.mjs";

function unique(values) {
  return [...new Set(values)];
}

function galleryFamily(src) {
  try {
    const url = new URL(src);
    const parentPath = url.pathname.slice(0, url.pathname.lastIndexOf("/") + 1);
    return `${url.origin}${parentPath}`;
  } catch {
    return null;
  }
}

function prioritizeGalleryImages(urls, verificationLimit = 10, storageLimit = 20) {
  if (urls.length <= verificationLimit) return urls.slice(0, storageLimit);
  const verificationSample = Array.from({ length: verificationLimit }, (_, index) =>
    urls[Math.round((index * (urls.length - 1)) / (verificationLimit - 1))],
  );
  const sampledSet = new Set(verificationSample);
  const remaining = urls.filter((url) => !sampledSet.has(url));
  const supplementalCount = Math.min(storageLimit - verificationSample.length, remaining.length);
  const storageSample = Array.from({ length: supplementalCount }, (_, index) =>
    remaining[Math.floor(((index + 0.5) * remaining.length) / supplementalCount)],
  );
  return [...verificationSample, ...storageSample];
}

export async function launchWithProfileRetry(
  launch,
  {
    attempts = 3,
    delayMs = 2_000,
    sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
  } = {},
) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await launch();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const profileBusy = /(?:copy of Firefox is already open|profile.+(?:in use|locked))/i.test(message);
      if (!profileBusy || attempt === attempts) throw error;
      await sleep(delayMs);
    }
  }
  throw new Error("Camoufox launch retry exhausted");
}

export function usableImages(images) {
  const seen = new Set();
  const candidates = images
    .filter((image) => image && typeof image.src === "string" && /^https:\/\//i.test(image.src))
    .filter((image) => !/\.(?:svg|gif)(?:\?|$)/i.test(image.src))
    .filter((image) => !/\b(?:logo|icon|sprite|badge|avatar|tracking)\b/i.test(`${image.src} ${image.alt ?? ""}`))
    .filter((image) => {
      if (seen.has(image.src)) return false;
      seen.add(image.src);
      return true;
    });
  const isLoadedListingPhoto = (image) =>
    Number(image.width ?? 0) >= 480 && Number(image.height ?? 0) >= 270;
  const loadedFamilyCounts = new Map();
  for (const image of candidates.filter(isLoadedListingPhoto)) {
    const family = galleryFamily(image.src);
    if (family) loadedFamilyCounts.set(family, (loadedFamilyCounts.get(family) ?? 0) + 1);
  }
  const listingGalleryFamilies = new Set(
    [...loadedFamilyCounts].filter(([, count]) => count >= 2).map(([family]) => family),
  );
  const isUnloaded = (image) => Number(image.width ?? 0) === 0 && Number(image.height ?? 0) === 0;
  const urls = candidates
    .filter((image) =>
      isLoadedListingPhoto(image) ||
      (isUnloaded(image) && listingGalleryFamilies.has(galleryFamily(image.src))),
    )
    .map((image) => image.src);
  return prioritizeGalleryImages(unique(urls));
}

export function vehicleFactsFromPage({ jsonLd = [], bodyText = "" }) {
  const boundedText = (value, maxLength) => {
    if (typeof value !== "string") return null;
    const text = value.trim();
    return text ? text.slice(0, maxLength) : null;
  };
  for (const raw of jsonLd) {
    try {
      const parsed = JSON.parse(raw);
      const records = Array.isArray(parsed) ? parsed : parsed?.["@graph"] ?? [parsed];
      const vehicle = records.find((record) => {
        const type = record?.["@type"];
        return type === "Vehicle" || (Array.isArray(type) && type.includes("Vehicle"));
      });
      if (!vehicle) continue;
      const numeric = (value) => {
        const rawValue = value && typeof value === "object" ? value.value : value;
        const normalized = String(rawValue ?? "").replace(/[^0-9.]/g, "");
        if (!/\d/.test(normalized)) return null;
        const number = Number(normalized);
        return Number.isFinite(number) ? Math.round(number) : null;
      };
      return {
        title: boundedText(vehicle.name, 300),
        vin: boundedText(vehicle.vehicleIdentificationNumber ?? vehicle.vin, 30),
        price: numeric(vehicle.offers?.price ?? vehicle.price),
        mileage: numeric(vehicle.mileageFromOdometer),
        transmissionClaim: boundedText(vehicle.vehicleTransmission, 200),
      };
    } catch {
      // Third-party structured data is often partially malformed; fall back to visible text.
    }
  }
  const visibleText = typeof bodyText === "string" ? bodyText : "";
  const number = (value) => {
    const normalized = String(value ?? "").replace(/[^0-9]/g, "");
    if (!/\d/.test(normalized)) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    title: visibleText.match(/(?:^|\n)(\d{4}\s+[^\n]{3,150})/)?.[1]?.trim() ?? null,
    vin: visibleText.match(/\bVIN[:\s]+([A-HJ-NPR-Z0-9]{17})\b/i)?.[1] ?? null,
    price: number(visibleText.match(/\$([\d,]+)/)?.[1]),
    mileage: number(visibleText.match(/([\d,]+)\s*(?:mi\.|miles)\b/i)?.[1]),
    transmissionClaim: visibleText.match(/\b(?:[456][ -]?speed\s+)?manual\b/i)?.[0] ?? null,
  };
}

export async function guardedGoto(
  page,
  url,
  {
    purpose,
    resolveHost,
  },
) {
  const authorize = (candidateUrl) => authorizeNavigationUrl(candidateUrl, { purpose, resolveHost });
  const authorizeResource = (candidateUrl) => authorizePublicResourceUrl(candidateUrl, { resolveHost });
  await authorize(url);
  let blockedNavigation = null;
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (!request.isNavigationRequest() || request.frame() !== page.mainFrame()) {
      try {
        await authorizeResource(request.url());
        await route.continue();
      } catch {
        await route.abort("blockedbyclient");
      }
      return;
    }
    try {
      await authorize(request.url());
      await route.continue();
    } catch (error) {
      blockedNavigation = error;
      await route.abort("blockedbyclient");
    }
  });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  } catch (error) {
    if (blockedNavigation) throw blockedNavigation;
    throw error;
  }
  if (blockedNavigation) throw blockedNavigation;
  await authorize(page.url());
}

export async function createCamoufoxBrowser({ minimumIntervalMs, profileDirectory = ".catcht/browser-profile" }) {
  const { Camoufox } = await import("camoufox-js");
  const absoluteProfile = resolve(profileDirectory);
  await mkdir(absoluteProfile, { recursive: true, mode: 0o700 });
  const context = await launchWithProfileRetry(() => Camoufox({
      headless: true,
      humanize: true,
      locale: "en-US",
      user_data_dir: absoluteProfile,
    }));
  let previousRequestAt = 0;

  async function pace() {
    const remaining = Math.max(0, minimumIntervalMs - (Date.now() - previousRequestAt));
    if (remaining) await new Promise((resolvePromise) => setTimeout(resolvePromise, remaining));
    previousRequestAt = Date.now();
  }

  async function withPage(url, purpose, operation) {
    await pace();
    const page = await context.newPage();
    try {
      await guardedGoto(page, url, { purpose });
      await page.waitForTimeout(2_500);
      await authorizeNavigationUrl(page.url(), { purpose });
      return await operation(page);
    } finally {
      await page.close().catch(() => {});
    }
  }

  return {
    async discover(url) {
      return withPage(url, "discovery", async (page) => {
        await page.waitForTimeout(2_000);
        const bodyText = await page.locator("body").innerText();
        if (challengeDetected(bodyText)) return { status: "challenged", items: [] };
        const items = await page.evaluate(() =>
          Array.from(document.querySelectorAll("li"), (element) => ({
            heading: element.querySelector("h2")?.textContent?.trim() ?? "",
            text: element.textContent?.replace(/\s+/g, " ").trim() ?? "",
            links: Array.from(element.querySelectorAll("a[href]"), (link) => ({
              text: link.textContent?.replace(/\s+/g, " ").trim() ?? "",
              href: link.href,
            })),
            imageUrls: Array.from(element.querySelectorAll("img"), (image) => image.currentSrc || image.src).filter(Boolean),
          })),
        );
        return { status: "ok", items };
      });
    },

    async inspectListing(url, { openGallery = true } = {}) {
      return withPage(url, "listing", async (page) => {
        let bodyText = await page.locator("body").innerText();
        if (challengeDetected(bodyText)) return { status: "challenged", images: [], facts: vehicleFactsFromPage({ bodyText }) };
        if (openGallery) {
          const buttons = page.locator("button");
          const labels = await buttons.allTextContents();
          const galleryIndex = labels.findIndex((label) => /\b(?:see|view|open)?\s*(?:all\s*)?(?:photos?|gallery)\b/i.test(label));
          if (galleryIndex >= 0) {
            await buttons.nth(galleryIndex).click({ timeout: 5_000 }).catch(() => {});
            await page.waitForTimeout(1_500);
            bodyText = await page.locator("body").innerText();
          }
        }
        if (challengeDetected(bodyText)) return { status: "challenged", images: [], facts: vehicleFactsFromPage({ bodyText }) };
        const pageData = await page.evaluate(() => ({
          jsonLd: Array.from(document.querySelectorAll("script[type='application/ld+json']"), (script) => script.textContent ?? ""),
          images: Array.from(document.images, (image) => ({
            src: image.currentSrc || image.src,
            alt: image.alt,
            width: image.naturalWidth || image.width,
            height: image.naturalHeight || image.height,
          })),
        }));
        return {
          status: "ok",
          images: usableImages(pageData.images),
          facts: vehicleFactsFromPage({ jsonLd: pageData.jsonLd, bodyText }),
        };
      });
    },

    async close() {
      await context.close();
    },
  };
}
