import test from "node:test";
import assert from "node:assert/strict";
import { parseLeasehackrFeed, runLeasehackrAdapter } from "../src/adapters/leasehackr.mjs";

const feed = `<?xml version="1.0"?><rss version="2.0"><channel>
  <item>
    <title>2026 Audi Q5 $599/mo + tax, $3k DAS, 36/10 - Northeast</title>
    <link>https://forum.leasehackr.com/t/audi-q5-special/123</link>
    <guid>https://forum.leasehackr.com/t/audi-q5-special/123</guid>
    <pubDate>Tue, 14 Jul 2026 12:00:00 GMT</pubDate>
    <category>audi</category><category>pa</category><category>marketplace</category>
    <description><![CDATA[Dealer special. MSRP $52,000. Broker fee $599.]]></description>
  </item>
  <item>
    <title>BMW X3 July lease specials - Northeast</title>
    <link>https://forum.leasehackr.com/t/bmw-specials/124</link>
    <guid>https://forum.leasehackr.com/t/bmw-specials/124</guid>
    <pubDate>Tue, 14 Jul 2026 11:00:00 GMT</pubDate>
    <category>bmw</category><category>marketplace</category>
    <description><![CDATA[See the linked sheet for current models and terms.]]></description>
  </item>
</channel></rss>`;

test("parses disclosed Leasehackr terms and preserves vague posts as low-confidence leads", () => {
  const offers = parseLeasehackrFeed(feed, [{
    id: "lease-audi-q5",
    name: "Audi Q5 leases",
    offerKind: "lease",
    make: "Audi",
    model: "Q5",
    region: "Northeast",
    maxEffectiveMonthly: 750,
    maxDueAtSigning: 4_000,
  }, {
    id: "lease-bmw-x3",
    name: "BMW X3 leases",
    offerKind: "lease",
    make: "BMW",
    model: "X3",
    region: "Northeast",
    maxEffectiveMonthly: 800,
    maxDueAtSigning: 5_000,
  }]);

  assert.equal(offers.length, 2);
  assert.deepEqual(offers[0], {
    offerKind: "lease",
    condition: "new",
    source: "leasehackr",
    originSource: "forum.leasehackr.com",
    sourceListingId: "123",
    searchId: "lease-audi-q5",
    url: "https://forum.leasehackr.com/t/audi-q5-special/123",
    year: 2026,
    make: "Audi",
    model: "Q5",
    trim: null,
    title: "2026 Audi Q5 $599/mo + tax, $3k DAS, 36/10 - Northeast",
    price: null,
    mileage: null,
    distanceMiles: null,
    location: "Northeast",
    transmissionClaim: null,
    imageUrls: [],
    primaryImageUrl: null,
    marketEstimate: null,
    monthlyPayment: 599,
    dueAtSigning: 3_000,
    termMonths: 36,
    annualMiles: 10_000,
    brokerFee: 599,
    acquisitionFee: null,
    dispositionFee: null,
    msrp: 52_000,
    moneyFactor: null,
    residualPercent: null,
    discountPercent: null,
    taxesIncluded: false,
    effectiveMonthly: 682.33,
    region: "Northeast",
    parseConfidence: 0.95,
    sellerName: null,
    requiresManualVerification: false,
    manualEvidence: [],
    publishedAt: "2026-07-14T12:00:00.000Z",
    expiresAt: "2026-08-18T12:00:00.000Z",
  });
  assert.equal(offers[1].sourceListingId, "124");
  assert.equal(offers[1].monthlyPayment, null);
  assert.equal(offers[1].effectiveMonthly, null);
  assert.ok(offers[1].parseConfidence < 0.7);
});

test("honors disclosed annual-mile limits without hiding incomplete leads", () => {
  const offers = parseLeasehackrFeed(feed, [{
    id: "lease-audi-q5",
    name: "Audi Q5 leases",
    offerKind: "lease",
    make: "Audi",
    model: "Q5",
    region: "Northeast",
    minAnnualMiles: 12_000,
  }]);
  assert.equal(offers.length, 0);
});

test("requires model and region evidence instead of inventing a requested lease", () => {
  const mismatchedFeed = `<?xml version="1.0"?><rss version="2.0"><channel>
    <item>
      <title>2026 BMW X5 $699/mo - Northeast</title>
      <link>https://forum.leasehackr.com/t/bmw-x5-northeast/201</link>
      <pubDate>Tue, 14 Jul 2026 12:00:00 GMT</pubDate>
      <description>BMW X5 broker special in PA.</description>
    </item>
    <item>
      <title>2026 BMW X3 $649/mo - Southern California</title>
      <link>https://forum.leasehackr.com/t/bmw-x3-california/202</link>
      <pubDate>Tue, 14 Jul 2026 12:00:00 GMT</pubDate>
      <description>BMW X3 broker special in SoCal.</description>
    </item>
    <item>
      <title>2026 BMW X3 $629/mo - PA</title>
      <link>https://forum.leasehackr.com/t/bmw-x3-pa/203</link>
      <pubDate>Tue, 14 Jul 2026 12:00:00 GMT</pubDate>
      <category>northeast</category>
      <description>BMW X3 broker special.</description>
    </item>
  </channel></rss>`;
  const offers = parseLeasehackrFeed(mismatchedFeed, [{
    id: "lease-bmw-x3",
    name: "BMW X3 leases",
    offerKind: "lease",
    make: "BMW",
    model: "X3",
    region: "Northeast",
  }]);

  assert.deepEqual(offers.map((offer) => offer.sourceListingId), ["203"]);
  assert.equal(offers[0].make, "BMW");
  assert.equal(offers[0].model, "X3");
  assert.equal(offers[0].region, "Northeast");
});

test("refuses scheduled RSS retrieval under current source terms", async () => {
  let requested = false;
  const result = await runLeasehackrAdapter({
    searches: [{ id: "lease-audi-q5", offerKind: "lease", make: "Audi", model: "Q5", region: "Northeast" }],
    feedUrl: "https://forum.leasehackr.com/c/marketplace/7.rss",
    fetchImpl: async () => {
      requested = true;
      return new Response(feed, { status: 200, headers: { "content-type": "application/rss+xml" } });
    },
  });
  assert.equal(requested, false);
  assert.equal(result.offers.length, 0);
  assert.equal(result.run.status, "unavailable");
  assert.equal(result.run.messageCode, "source_terms_prohibit_automation");
});
