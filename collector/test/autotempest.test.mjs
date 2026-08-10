import test from "node:test";
import assert from "node:assert/strict";
import { selectCandidates } from "../src/autotempest.mjs";

const model = {
  make: "Scion",
  model: "FR-S",
  aliases: ["FR-S", "FRS"],
  sourceIds: { autotempest: "frs" },
};

const policy = {
  zip: "10001",
  radiusMiles: 150,
  maxPrice: 15_000,
  maxMileage: 120_000,
  transmission: "manual",
};

const valid = {
  heading: "2013 Scion FR-S Base Cars.com",
  text: "$10,999 · 81,711 mi. · Philadelphia, PA (25 mi. from 10001) · 6-Speed Manual",
  links: [
    { text: "2013 Scion FR-S Base", href: "https://www.cars.com/vehicledetail/example-id/" },
    { text: "Cars.com", href: "https://www.cars.com/vehicledetail/example-id/" },
  ],
  imageUrls: ["https://images.cars.com/example.jpg"],
};

test("normalizes an in-policy aggregate result into an ingest candidate", () => {
  assert.deepEqual(selectCandidates([valid], { model, policy, includeAuctions: false, limit: 5 }), [
    {
      source: "cars.com",
      sourceListingId: "example-id",
      url: "https://www.cars.com/vehicledetail/example-id/",
      year: 2013,
      make: "Scion",
      model: "FR-S",
      trim: null,
      title: "2013 Scion FR-S Base",
      price: 10_999,
      mileage: 81_711,
      distanceMiles: 25,
      location: "Philadelphia, PA",
      transmissionClaim: "6-Speed Manual",
      imageUrls: ["https://images.cars.com/example.jpg"],
      primaryImageUrl: "https://images.cars.com/example.jpg",
      marketEstimate: null,
    },
  ]);
});

test("drops auctions, automatics, over-budget cars, and duplicate URLs", () => {
  const automatic = { ...valid, text: valid.text.replace("6-Speed Manual", "6-Speed Automatic") };
  const auction = { ...valid, text: `${valid.text} · Current bid · 3 days left` };
  const expensive = { ...valid, text: valid.text.replace("$10,999", "$15,001") };

  assert.deepEqual(
    selectCandidates([valid, valid, automatic, auction, expensive], {
      model,
      policy,
      includeAuctions: false,
      limit: 5,
    }),
    selectCandidates([valid], { model, policy, includeAuctions: false, limit: 5 }),
  );
});

test("drops known auction hosts even when the aggregate card omits auction language", () => {
  const hostOnlyAuction = {
    ...valid,
    links: [{ text: "2013 Scion FR-S Base", href: "https://carsandbids.com/auctions/example-frs" }],
  };

  assert.deepEqual(
    selectCandidates([hostOnlyAuction], { model, policy, includeAuctions: false, limit: 5 }),
    [],
  );
});

test("drops unknown source hosts before they can reach browser navigation", () => {
  const unknownHost = {
    ...valid,
    links: [{ text: "2013 Scion FR-S Base", href: "https://inventory.unapproved.example/example-frs" }],
  };

  assert.deepEqual(
    selectCandidates([unknownHost], { model, policy, includeAuctions: false, limit: 5 }),
    [],
  );
});
