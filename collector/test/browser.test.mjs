import test from "node:test";
import assert from "node:assert/strict";
import { guardedGoto, launchWithProfileRetry, usableImages, vehicleFactsFromPage } from "../src/browser.mjs";

test("keeps large actual-car photos while excluding logos and tracking assets", () => {
  assert.deepEqual(usableImages([
    { src: "https://images.example/car-front.jpg", alt: "front three-quarter", width: 1600, height: 900 },
    { src: "https://images.example/dealer-logo.png", alt: "dealer logo", width: 1200, height: 600 },
    { src: "https://images.example/shifter.jpg", alt: "interior", width: 1200, height: 800 },
    { src: "https://images.example/tiny.jpg", alt: "thumbnail", width: 120, height: 90 },
  ]), [
    "https://images.example/car-front.jpg",
    "https://images.example/shifter.jpg",
  ]);
});

test("keeps lazy listing-gallery siblings and prioritizes full-gallery coverage for verification", () => {
  const galleryRoot = "https://platform.cstatic-images.com/xxlarge/in/v2/dealer/listing";
  const images = Array.from({ length: 44 }, (_, index) => ({
    src: `${galleryRoot}/photo-${index + 1}.jpg`,
    alt: "2015 Scion FR-S Base",
    width: index < 5 ? 1024 : 0,
    height: index < 5 ? 768 : 0,
  }));
  const manualInterior = images[29].src;
  images.push(
    {
      src: "https://platform.cstatic-images.com/xxlarge/in/v2/dealer/other-listing/photo.jpg",
      alt: "unrelated recommendation",
      width: 0,
      height: 0,
    },
    {
      src: `${galleryRoot}/dealer-logo.png`,
      alt: "dealer logo",
      width: 0,
      height: 0,
    },
  );

  const result = usableImages(images);

  assert.equal(result.length, 20);
  assert.equal(result[0], images[0].src);
  assert.ok(result.includes(images.at(-3).src), "lazy sibling should be retained");
  assert.ok(result.slice(0, 10).includes(manualInterior), "first ten should sample the full gallery");
  assert.ok(result.includes(images[41].src), "stored photos should preserve late-gallery closeups");
  assert.ok(!result.includes(images.at(-2).src), "unrelated lazy image should stay excluded");
  assert.ok(!result.includes(images.at(-1).src), "logo should stay excluded");
});

test("prefers vehicle JSON-LD for authoritative listing facts", () => {
  const facts = vehicleFactsFromPage({
    jsonLd: [JSON.stringify({
      "@type": "Vehicle",
      name: "2017 Mazda MX-5 Miata Club",
      vehicleIdentificationNumber: "JM1NDAC75H0123456",
      vehicleTransmission: "6-Speed Manual",
      mileageFromOdometer: { value: "72,104" },
      offers: { price: "14950" },
    })],
    bodyText: "$99,999 unrelated promotion",
  });

  assert.equal(facts.title, "2017 Mazda MX-5 Miata Club");
  assert.equal(facts.price, 14_950);
  assert.equal(facts.mileage, 72_104);
  assert.equal(facts.transmissionClaim, "6-Speed Manual");
});

test("returns null for absent numeric facts so aggregate mileage and price remain intact", () => {
  const facts = vehicleFactsFromPage({
    jsonLd: [JSON.stringify({ "@type": "Vehicle", name: "2015 Scion FR-S" })],
  });

  assert.equal(facts.price, null);
  assert.equal(facts.mileage, null);
});

test("normalizes malformed third-party JSON-LD strings instead of passing objects downstream", () => {
  const facts = vehicleFactsFromPage({
    jsonLd: [JSON.stringify({
      "@type": "Vehicle",
      name: { unexpected: "object" },
      vehicleIdentificationNumber: { copied: true },
      vehicleTransmission: ["Manual", { unexpected: true }],
    })],
  });

  assert.equal(facts.title, null);
  assert.equal(facts.vin, null);
  assert.equal(facts.transmissionClaim, null);
});

test("blocks a redirect outside listing policy before final document extraction", async () => {
  const mainFrame = {};
  let handler;
  let currentUrl = "about:blank";
  let continued = 0;
  let aborted = 0;
  const page = {
    mainFrame: () => mainFrame,
    route: async (_pattern, routeHandler) => { handler = routeHandler; },
    goto: async (initialUrl) => {
      currentUrl = initialUrl;
      const redirectUrl = "https://inventory.unapproved.example/redirected";
      await handler({
        request: () => ({
          isNavigationRequest: () => true,
          frame: () => mainFrame,
          url: () => redirectUrl,
        }),
        continue: async () => { continued += 1; currentUrl = redirectUrl; },
        abort: async () => { aborted += 1; },
      });
    },
    url: () => currentUrl,
  };

  await assert.rejects(
    guardedGoto(page, "https://www.cars.com/vehicledetail/example-id/", {
      purpose: "listing",
      resolveHost: async () => [{ address: "93.184.216.34", family: 4 }],
    }),
    /unsupported listing host/,
  );
  assert.equal(continued, 0);
  assert.equal(aborted, 1);
});

test("preserves an approved public listing navigation", async () => {
  const mainFrame = {};
  let handler;
  let currentUrl = "about:blank";
  const page = {
    mainFrame: () => mainFrame,
    route: async (_pattern, routeHandler) => { handler = routeHandler; },
    goto: async (initialUrl) => {
      await handler({
        request: () => ({
          isNavigationRequest: () => true,
          frame: () => mainFrame,
          url: () => initialUrl,
        }),
        continue: async () => { currentUrl = initialUrl; },
        abort: async () => { throw new Error("approved navigation was aborted"); },
      });
    },
    url: () => currentUrl,
  };

  await guardedGoto(page, "https://www.cars.com/vehicledetail/example-id/", {
    purpose: "listing",
    resolveHost: async () => [{ address: "93.184.216.34", family: 4 }],
  });
  assert.equal(currentUrl, "https://www.cars.com/vehicledetail/example-id/");
});

test("blocks private subresources while preserving public listing assets", async () => {
  const mainFrame = {};
  const childFrame = {};
  let handler;
  let currentUrl = "about:blank";
  const decisions = [];
  const page = {
    mainFrame: () => mainFrame,
    route: async (_pattern, routeHandler) => { handler = routeHandler; },
    goto: async (initialUrl) => {
      currentUrl = initialUrl;
      for (const resourceUrl of [
        "https://images.example-cdn.com/listing/front.jpg",
        "https://127.0.0.1/private-admin-action",
        "https://internal.example/private-admin-action",
        "http://images.example-cdn.com/listing/insecure.jpg",
        "https://user:password@images.example-cdn.com/listing/credentialed.jpg",
      ]) {
        await handler({
          request: () => ({
            isNavigationRequest: () => false,
            frame: () => childFrame,
            url: () => resourceUrl,
          }),
          continue: async () => { decisions.push([resourceUrl, "continued"]); },
          abort: async () => { decisions.push([resourceUrl, "aborted"]); },
        });
      }
    },
    url: () => currentUrl,
  };

  await guardedGoto(page, "https://www.cars.com/vehicledetail/example-id/", {
    purpose: "listing",
    resolveHost: async (hostname) => [{
      address: hostname === "127.0.0.1"
        ? "127.0.0.1"
        : hostname === "internal.example" ? "10.0.0.8" : "93.184.216.34",
      family: 4,
    }],
  });

  assert.deepEqual(decisions, [
    ["https://images.example-cdn.com/listing/front.jpg", "continued"],
    ["https://127.0.0.1/private-admin-action", "aborted"],
    ["https://internal.example/private-admin-action", "aborted"],
    ["http://images.example-cdn.com/listing/insecure.jpg", "aborted"],
    ["https://user:password@images.example-cdn.com/listing/credentialed.jpg", "aborted"],
  ]);
});

test("waits for a recently closed persistent profile before retrying launch", async () => {
  let attempts = 0;
  const waits = [];
  const context = { close() {} };
  const result = await launchWithProfileRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("A copy of Firefox is already open");
      return context;
    },
    { delayMs: 25, sleep: async (milliseconds) => waits.push(milliseconds) },
  );

  assert.equal(result, context);
  assert.equal(attempts, 2);
  assert.deepEqual(waits, [25]);
});

test("does not retry unrelated browser launch failures", async () => {
  let attempts = 0;
  await assert.rejects(
    launchWithProfileRetry(async () => {
      attempts += 1;
      throw new Error("browser executable is missing");
    }, { sleep: async () => {} }),
    /executable is missing/,
  );
  assert.equal(attempts, 1);
});
