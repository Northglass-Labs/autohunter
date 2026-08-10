import { describe, expect, it } from "vitest";
import { canonicalListingUrl, listingIdentity } from "./identity";
import type { CandidateListing } from "./types";

const base = {
  source: "cargurus",
  sourceListingId: "123",
  url: "https://www.cargurus.com/Cars/inventorylisting/vdp.action?listingId=123&utm_source=x",
  year: 2018,
  make: "Subaru",
  model: "BRZ",
  title: "2018 Subaru BRZ",
  price: 18_500,
  mileage: 61_000,
  distanceMiles: 22,
  location: "Philadelphia, PA",
  imageUrls: [],
  manualEvidence: [],
} satisfies CandidateListing;

describe("listingIdentity", () => {
  it("keeps persistence identity source-scoped even when a VIN is present", () => {
    expect(listingIdentity({ ...base, vin: " jF1Zcac10j9600001 " })).toBe(
      "cargurus:123",
    );
  });

  it("falls back to source listing ID", () => {
    expect(listingIdentity(base)).toBe("cargurus:123");
  });

  it("strips tracking params while retaining identity params", () => {
    expect(canonicalListingUrl(base.url)).toBe(
      "https://www.cargurus.com/Cars/inventorylisting/vdp.action?listingId=123",
    );
  });

  it("does not collapse independent source records that claim the same VIN", () => {
    const vin = "JF1ZCAC10J9600001";
    const dealer = {
      ...base,
      source: "dealer" as const,
      sourceListingId: "123",
      url: "https://inventory.example-dealer.com/used/2018-subaru-brz-123",
      vin,
    };

    expect(listingIdentity({ ...base, vin })).not.toBe(listingIdentity(dealer));
  });

  it("keeps one multi-model forum topic distinct for each saved search", () => {
    const lease = {
      offerKind: "lease" as const,
      condition: "new" as const,
      source: "leasehackr" as const,
      sourceListingId: "456",
      searchId: "audi-q5",
      url: "https://forum.leasehackr.com/t/july-specials/456",
      make: "Audi",
      model: "Q5",
      title: "Audi July specials",
      location: "Northeast",
      imageUrls: [],
      manualEvidence: [],
    };
    expect(listingIdentity(lease)).toBe("leasehackr:audi-q5:456");
    expect(listingIdentity(lease)).not.toBe(listingIdentity({ ...lease, searchId: "audi-q7", model: "Q7" }));
  });
});
