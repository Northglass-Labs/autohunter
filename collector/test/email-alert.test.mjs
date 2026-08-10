import test from "node:test";
import assert from "node:assert/strict";
import { parseAuthorizedEmailAlerts, runEmailAlertAdapter } from "../src/adapters/email-alert.mjs";
import { approvedGogPath, buildGogArguments } from "../src/gog-email-cycle.mjs";

const searches = [{
  id: "11111111-1111-4111-8111-111111111111",
  name: "Member Lexus TX lease",
  offerKind: "lease",
  make: "Lexus",
  model: "TX",
  aliases: ["TX 350", "TX350"],
  region: "Northeast",
  maxEffectiveMonthly: 750,
  maxDueAtSigning: 4_000,
  minAnnualMiles: 10_000,
  profile: "lease",
  garageGroup: "lease",
  desiredFeatures: ["adaptive_cruise_lane_centering", "third_row"],
}];

test("normalizes a user-authorized lease alert without persisting the email body", () => {
  const offers = parseAuthorizedEmailAlerts([{
    id: "gmail-message-1",
    threadId: "gmail-thread-1",
    date: "2026-08-09 14:30",
    from: "Example Lexus <offers@dealer.example>",
    subject: "2026 Lexus TX 350 lease offer - Northeast",
    body: `Lexus TX 350 Premium\n$649/mo with $2,999 due at signing\n36 months / 10k miles per year\nMSRP $61,500\nView vehicle: https://dealer.example/vehicles/lexus-tx-350-abc\nUnsubscribe: https://tracking.example/unsubscribe/abc`,
  }], searches, new Date("2026-08-09T15:00:00.000Z"));

  assert.equal(offers.length, 1);
  assert.deepEqual(offers[0], {
    offerKind: "lease",
    condition: "new",
    offerRole: "active_offer",
    sourceMethod: "authorized_email",
    source: "email_alert",
    originSource: "dealer.example",
    sourceListingId: offers[0].sourceListingId,
    searchId: searches[0].id,
    url: "https://dealer.example/vehicles/lexus-tx-350-abc",
    year: 2026,
    make: "Lexus",
    model: "TX",
    trim: null,
    title: "2026 Lexus TX 350 lease offer - Northeast",
    price: null,
    mileage: null,
    distanceMiles: null,
    location: "Northeast",
    transmissionClaim: null,
    imageUrls: [],
    primaryImageUrl: null,
    marketEstimate: null,
    monthlyPayment: 649,
    dueAtSigning: 2_999,
    dueAtSigningIncludesFirstPayment: true,
    termMonths: 36,
    annualMiles: 10_000,
    brokerFee: null,
    acquisitionFee: null,
    acquisitionFeeIncludedInDueAtSigning: null,
    dispositionFee: null,
    securityDeposit: null,
    securityDepositRefundable: null,
    msrp: 61_500,
    moneyFactor: null,
    residualPercent: null,
    discountPercent: null,
    taxesIncluded: null,
    effectiveMonthly: 714.28,
    region: "Northeast",
    parseConfidence: 0.95,
    sellerName: "Example Lexus",
    requiresManualVerification: false,
    manualEvidence: [],
    garageGroup: "lease",
    powertrainCategory: "any",
    featureEvidence: [],
    packageNames: [],
    featureMatchScore: 0,
    familyFitScore: 0,
    enrichmentStatus: "not_requested",
    publishedAt: "2026-08-09T14:30:00.000Z",
    expiresAt: "2026-08-23T14:30:00.000Z",
  });
  assert.equal(JSON.stringify(offers[0]).includes("Unsubscribe"), false);
  assert.match(offers[0].sourceListingId, /^gmail:[a-f0-9]{32}$/);
});

test("keeps an official Leasehackr signed deal as a benchmark and handles true zero DAS", () => {
  const offers = parseAuthorizedEmailAlerts([{
    id: "gmail-summary-1",
    threadId: "gmail-summary-thread-1",
    date: "2026-08-06 12:00",
    from: "Leasehackr Forum <noreply@forum.leasehackr.com>",
    subject: "Leasehackr Forum Summary",
    body: `SIGNED: 2025 BMW iX M60 — $685/mo, $0 DAS, 36/10k. Seven refundable MSDs: $5,600.\nhttps://forum.leasehackr.com/t/signed-2025-bmw-ix-m60/600001`,
  }], [{
    ...searches[0],
    id: "22222222-2222-4222-8222-222222222222",
    name: "BMW iX lease",
    make: "BMW",
    model: "iX",
    aliases: ["iX M60"],
    maxEffectiveMonthly: 600,
  }]);

  assert.equal(offers.length, 1);
  assert.equal(offers[0].offerRole, "benchmark");
  assert.equal(offers[0].sourceMethod, "authorized_email");
  assert.equal(offers[0].dueAtSigningIncludesFirstPayment, false);
  assert.equal(offers[0].effectiveMonthly, 685);
  assert.equal(offers[0].securityDeposit, 5_600);
  assert.equal(offers[0].securityDepositRefundable, true);
  assert.equal(offers[0].originSource, "forum.leasehackr.com");
  assert.equal(JSON.stringify(offers[0]).includes("Seven refundable MSDs"), false);
});

test("splits a Leasehackr digest into model-specific offers without crossing economics", () => {
  const offers = parseAuthorizedEmailAlerts([{
    id: "gmail-summary-multiple",
    date: "2026-08-06 12:00",
    from: "Leasehackr Forum <noreply@forum.leasehackr.com>",
    subject: "Summary",
    body: `[Leasehackr Forum](https://forum.leasehackr.com)\n\n` +
      `[SIGNED: 2025 BMW iX M60 — $685/mo, $0 DAS, 36/10k](https://forum.leasehackr.com/t/signed-bmw-ix/600001)\n\n` +
      `MSRP $121,000. Seven refundable MSDs: $5,600.\n\n` +
      `[BMW iX delivery photo](https://leasehackr-assets.b-cdn.net/optimized/example.jpeg)\n\n` +
      `[Read More](https://forum.leasehackr.com/t/signed-bmw-ix/600001)\n\n` +
      `[SIGNED: 2026 Mercedes-Benz GLC 300 — $316/mo, $2,700 DAS, 24/10k](https://forum.leasehackr.com/t/signed-mercedes-glc/600002)\n\n` +
      `MSRP $53,000. Taxes included.\n\n` +
      `[Read More](https://forum.leasehackr.com/t/signed-mercedes-glc/600002)`,
  }], [{
    ...searches[0],
    id: "22222222-2222-4222-8222-222222222222",
    name: "BMW iX lease",
    make: "BMW",
    model: "iX",
    aliases: ["iX M60"],
    maxEffectiveMonthly: 1_000,
    maxDueAtSigning: 10_000,
  }, {
    ...searches[0],
    id: "33333333-3333-4333-8333-333333333333",
    name: "Mercedes GLC lease",
    make: "Mercedes-Benz",
    model: "GLC",
    aliases: ["Mercedes GLC", "GLC 300"],
    maxEffectiveMonthly: 1_000,
    maxDueAtSigning: 10_000,
  }]);

  assert.equal(offers.length, 2);
  const bmw = offers.find((offer) => offer.make === "BMW");
  const mercedes = offers.find((offer) => offer.make === "Mercedes-Benz");
  assert.equal(bmw.url, "https://forum.leasehackr.com/t/signed-bmw-ix/600001");
  assert.equal(bmw.monthlyPayment, 685);
  assert.equal(bmw.dueAtSigning, 0);
  assert.equal(bmw.msrp, 121_000);
  assert.match(bmw.title, /BMW iX M60/);
  assert.equal(mercedes.url, "https://forum.leasehackr.com/t/signed-mercedes-glc/600002");
  assert.equal(mercedes.monthlyPayment, 316);
  assert.equal(mercedes.dueAtSigning, 2_700);
  assert.equal(mercedes.msrp, 53_000);
  assert.match(mercedes.title, /Mercedes-Benz GLC 300/);
});

test("unwraps authorized newsletter redirects and drops recipient tracking parameters", () => {
  const destination = encodeURIComponent(
    "https://forum.leasehackr.com/t/signed-lexus-tx/600003?ss_source=campaign&utm_medium=email",
  );
  const offers = parseAuthorizedEmailAlerts([{
    id: "gmail-newsletter-redirect",
    date: "2026-08-06 12:00",
    from: "Leasehackr <community@leasehackr.com>",
    subject: "Luxury SUV deal alert",
    body: `[SIGNED: 2026 Lexus TX 350 — $649/mo, $2,999 DAS, 36/10k](` +
      `https://mailer.engage.squarespace-mail.com/r?m=recipient-token&u=${destination}&s=signature)\n\n` +
      `MSRP $61,500.`,
  }], searches);

  assert.equal(offers.length, 1);
  assert.equal(offers[0].url, "https://forum.leasehackr.com/t/signed-lexus-tx/600003");
  assert.equal(offers[0].originSource, "forum.leasehackr.com");
  assert.equal(JSON.stringify(offers[0]).includes("recipient-token"), false);
  assert.equal(JSON.stringify(offers[0]).includes("squarespace-mail"), false);
});

test("parses GOG reference-style forum digests and normalizes one-pay benchmarks", () => {
  const offers = parseAuthorizedEmailAlerts([{
    id: "gmail-gog-reference-summary",
    date: "2026-08-06 12:00",
    from: "Leasehackr Forum <noreply@forum.leasehackr.com>",
    subject: "Summary",
    body: `A brief summary of [Leasehackr Forum][1]\n\n` +
      `[Signed. Example compact lease][2]\n\n$8 per month, 12 months.\n\n` +
      `[SIGNED! 2025 BMW iX M60 36/10k $685/month 0 DAS 4900 MSDs][3]\n\n` +
      `MSRP $117,040\nDAS: 0\n7 refundable MSDs: $4,900\n\n` +
      `![BMW delivery photo](https://leasehackr-assets.b-cdn.net/optimized/example.jpeg)\n\n` +
      `[Signed! 2023 Porsche CPO Cayenne S Coupe - $23,201 one pay 24/10k][4]\n\n` +
      `MSRP $131,100\nOne pay $23,201\n24 month - 10k mile per year lease\n\n` +
      `[1]: https://forum.leasehackr.com/\n` +
      `[2]: https://forum.leasehackr.com/t/signed-example/600000\n` +
      `[3]: https://forum.leasehackr.com/t/signed-bmw-ix/600001\n` +
      `[4]: https://forum.leasehackr.com/t/signed-porsche-cayenne/600002`,
  }], [{
    ...searches[0],
    id: "44444444-4444-4444-8444-444444444444",
    name: "BMW iX lease",
    make: "BMW",
    model: "iX",
    aliases: ["iX M60"],
    maxEffectiveMonthly: 2_000,
    maxDueAtSigning: 30_000,
  }, {
    ...searches[0],
    id: "55555555-5555-4555-8555-555555555555",
    name: "Porsche Cayenne lease",
    make: "Porsche",
    model: "Cayenne",
    aliases: ["Cayenne S Coupe"],
    maxEffectiveMonthly: 2_000,
    maxDueAtSigning: 30_000,
  }]);

  assert.equal(offers.length, 2);
  const bmw = offers.find((offer) => offer.make === "BMW");
  const porsche = offers.find((offer) => offer.make === "Porsche");
  assert.equal(bmw.url, "https://forum.leasehackr.com/t/signed-bmw-ix/600001");
  assert.match(bmw.title, /BMW iX M60/);
  assert.equal(bmw.monthlyPayment, 685);
  assert.equal(bmw.dueAtSigning, 0);
  assert.equal(porsche.url, "https://forum.leasehackr.com/t/signed-porsche-cayenne/600002");
  assert.match(porsche.title, /Porsche CPO Cayenne/);
  assert.equal(porsche.monthlyPayment, null);
  assert.equal(porsche.dueAtSigning, 23_201);
  assert.equal(porsche.effectiveMonthly, 966.71);
});

test("preserves an incomplete official editorial item as a market signal without inventing economics", () => {
  const offers = parseAuthorizedEmailAlerts([{
    id: "gmail-editorial-1",
    date: "2026-08-01T15:00:00.000Z",
    from: "Leasehackr Editorial <editorial@leasehackr.com>",
    subject: "August pre-negotiated Lexus TX offers",
    body: "Lexus TX 350 Northeast pricing was refreshed for August. See https://leasehackr.com/blog/lexus-tx-august-deals",
  }], searches);

  assert.equal(offers.length, 1);
  assert.equal(offers[0].offerRole, "market_signal");
  assert.equal(offers[0].sourceMethod, "authorized_email");
  assert.equal(offers[0].monthlyPayment, null);
  assert.equal(offers[0].effectiveMonthly, null);
  assert.ok(offers[0].parseConfidence < 0.7);
});

test("fails closed on incomplete economics, wrong models, and non-public links", () => {
  const base = {
    id: "gmail-message-2",
    threadId: "gmail-thread-2",
    date: "2026-08-09 14:30",
    from: "Deals <offers@example.com>",
    subject: "Lease special",
  };
  assert.deepEqual(parseAuthorizedEmailAlerts([{ ...base, body: "Lexus RX $599/mo 36/10 https://dealer.example/rx" }], searches), []);
  assert.deepEqual(parseAuthorizedEmailAlerts([{ ...base, body: "Lexus TX $599/mo https://localhost/admin" }], searches), []);
  assert.deepEqual(parseAuthorizedEmailAlerts([{ ...base, body: "Lexus TX terms linked https://dealer.example/tx" }], searches), []);
});

test("reports an empty authorized-email run without calling Gmail itself", async () => {
  const result = await runEmailAlertAdapter({ messages: [], searches });
  assert.deepEqual(result.offers, []);
  assert.equal(result.run.source, "email_alert");
  assert.equal(result.run.status, "empty");
  assert.equal(result.run.messageCode, "no_matching_messages");
});

test("fetches only the dedicated user-authorized Gmail label in read-only JSON mode", () => {
  const query = 'label:"AutoHunter/Lease Inputs" newer_than:14d';
  const args = buildGogArguments(query);

  assert.deepEqual(args.slice(0, 3), ["gmail", "messages", "search"]);
  assert.ok(args.includes("--readonly"));
  assert.ok(args.includes("--json"));
  assert.ok(args.includes("--results-only"));
  assert.ok(args.includes("--include-body"));
  assert.ok(args.includes("--timezone"));
  assert.ok(args.includes("UTC"));
  assert.equal(args.at(-1), query);
  assert.equal(args.some((argument) => ["send", "modify", "mark-read", "archive"].includes(argument)), false);
});

test("keeps a 45-day authorized mailbox lookback so monthly editorials remain available", () => {
  const args = buildGogArguments();
  assert.equal(args.at(-1), 'label:"AutoHunter/Lease Inputs" newer_than:45d');
});

test("runs the pinned GOG copy from an owner-controlled executable directory", () => {
  assert.equal(
    approvedGogPath("/Users/example"),
    "/Users/example/.local/bin/gog-autohunter-0.34.0",
  );
});
