import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicListing } from "./listing-fetch";
import { browserFallbackForStatus } from "./scrape-status";
import { sourceForUrl } from "./source-hosts";

describe("sourceForUrl", () => {
  it("recognizes configured listing hosts", () => {
    expect(sourceForUrl("https://www.cargurus.com/Cars/l-Used-Mazda-MX-5-Miata")).toBe("cargurus");
    expect(sourceForUrl("https://www.autotrader.com/cars-for-sale/vehicle/123")).toBe("autotrader");
    expect(sourceForUrl("https://www.autotempest.com/results?make=mazda")).toBe("autotempest");
    expect(sourceForUrl("https://www.hemmings.com/listing/1999-mazda-miata")).toBe("hemmings");
  });

  it("rejects lookalike and unapproved hosts", () => {
    expect(() => sourceForUrl("https://cargurus.com.evil.example/listing")).toThrow("unsupported");
    expect(() => sourceForUrl("http://127.0.0.1/private")).toThrow("unsupported");
  });
});

describe("browserFallbackForStatus", () => {
  it("routes bot and rate-limit responses to the Mac browser instead of rejecting the car", () => {
    expect(browserFallbackForStatus(403)).toBe(true);
    expect(browserFallbackForStatus(429)).toBe(true);
    expect(browserFallbackForStatus(404)).toBe(false);
  });
});

describe("fetchPublicListing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("revalidates every redirect before following it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: "https://inventory.unapproved.example/car" },
    })));

    await expect(fetchPublicListing("https://www.cars.com/vehicledetail/example-id/"))
      .rejects.toThrow("unsupported listing host");
  });

  it("preserves an allowed same-source redirect", async () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Vehicle",
      name: "2017 Mazda MX-5 Miata",
      mileageFromOdometer: { value: 72_104 },
      offers: { price: 14_950 },
    })}</script>`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "https://www.cars.com/vehicledetail/example-id/?redirected=1" },
      }))
      .mockResolvedValueOnce(new Response(html, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchPublicListing("https://cars.com/vehicledetail/example-id/");
    expect(result.vehicle.title).toBe("2017 Mazda MX-5 Miata");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops reading when the streamed body exceeds the hard limit", async () => {
    const chunk = new Uint8Array(3_000_000);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream, {
      status: 200,
      headers: { "content-type": "text/html" },
    })));

    await expect(fetchPublicListing("https://www.cars.com/vehicledetail/example-id/"))
      .rejects.toThrow("too large");
  });
});
