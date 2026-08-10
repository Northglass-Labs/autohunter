import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMarketCheckIncentiveGroups,
  buildMarketCheckIncentiveUrl,
  normalizeMarketCheckIncentive,
  runMarketCheckIncentivesAdapter,
} from "../src/adapters/marketcheck-incentives.mjs";

const search = {
  id: "lease-lexus-tx",
  name: "Lexus TX lease",
  offerKind: "lease",
  make: "Lexus",
  model: "TX",
  aliases: ["TX 350"],
  zip: "10001",
  region: "Northeast",
  maxEffectiveMonthly: 800,
  maxDueAtSigning: 4_000,
  minAnnualMiles: 10_000,
  profile: "lease",
  garageGroup: "lease",
  powertrainCategory: "any",
  active: true,
};

const incentive = {
  id: "oem-lexus-tx-august",
  base_sha: "base-sha",
  zip: "10001",
  city: "Philadelphia",
  state: "PA",
  source: "www.lexus.com",
  status_date: "2026-08-09T12:00:00Z",
  scraped_at_date: "2026-08-01T12:00:00Z",
  offer: {
    offer_type: "lease",
    vehicles: [{
      make: "Lexus",
      model: "TX",
      year: 2026,
      trim: "TX 350 Premium AWD",
      body_type: "SUV",
      drivetrain: "AWD",
      transmission: "Automatic",
      fuel_type: "Unleaded",
    }],
    amounts: [{ monthly: 649, term: 36, term_unit: "month" }],
    oem_program_name: "2026 TX 350 Premium AWD Lease",
    due_at_signing: 2_999,
    msrp: 66_000,
    security_deposit: 0,
    acquisition_fee: 795,
    disposition_fee: 350,
    mileage_limit: 10_000,
    valid_from: "08/01/2026",
    valid_through: "08/31/2026",
    titles: ["2026 Lexus TX 350 Premium AWD lease"],
    offers: ["$649 per month for 36 months with $2,999 due at signing."],
    disclaimers: ["Acquisition fee is included in the amount due at signing. Excludes tax and registration."],
  },
};

test("builds a make-and-ZIP OEM lease query with hard search limits", () => {
  const groups = buildMarketCheckIncentiveGroups([
    search,
    { ...search, id: "lease-lexus-rx", model: "RX", aliases: [] },
  ]);
  assert.equal(groups.length, 1);
  const url = buildMarketCheckIncentiveUrl(groups[0], { apiKey: "test-key", rows: 10 });
  assert.equal(url.origin + url.pathname, "https://api.marketcheck.com/v2/search/car/incentive/oem");
  assert.equal(url.searchParams.get("make"), "Lexus");
  assert.equal(url.searchParams.get("model"), "RX,TX");
  assert.equal(url.searchParams.get("zip"), "10001");
  assert.equal(url.searchParams.get("offer_type"), "lease");
  assert.equal(url.searchParams.get("monthly_range"), "1-800");
  assert.equal(url.searchParams.get("due_at_signing_range"), "0-4000");
  assert.equal(url.searchParams.get("sort_by"), "monthly");
  assert.equal(url.searchParams.get("rows"), "10");
  assert.equal(url.searchParams.get("api_key"), "test-key");
});

test("normalizes a structured OEM lease without double-counting fees inside total DAS", () => {
  const offer = normalizeMarketCheckIncentive(incentive, search, new Date("2026-08-10T12:00:00Z"));

  assert.ok(offer);
  assert.equal(offer.source, "marketcheck_incentives");
  assert.equal(offer.sourceMethod, "api");
  assert.equal(offer.offerRole, "active_offer");
  assert.equal(offer.sourceListingId, "oem-lexus-tx-august:2026:lexus:tx:tx-350-premium-awd");
  assert.equal(offer.url, "https://www.lexus.com/");
  assert.equal(offer.monthlyPayment, 649);
  assert.equal(offer.dueAtSigning, 2_999);
  assert.equal(offer.dueAtSigningIncludesFirstPayment, true);
  assert.equal(offer.acquisitionFee, 795);
  assert.equal(offer.acquisitionFeeIncludedInDueAtSigning, true);
  assert.equal(offer.securityDeposit, null);
  assert.equal(offer.effectiveMonthly, 714.28);
  assert.equal(offer.annualMiles, 10_000);
  assert.equal(offer.taxesIncluded, false);
  assert.equal(offer.expiresAt, "2026-08-31T23:59:59.999Z");
  assert.equal(JSON.stringify(offer).includes("base-sha"), false);
  assert.equal(JSON.stringify(offer).includes("test-key"), false);
});

test("keeps a current but incomplete OEM program as a market signal", () => {
  const partial = structuredClone(incentive);
  delete partial.offer.due_at_signing;
  delete partial.offer.mileage_limit;
  const offer = normalizeMarketCheckIncentive(partial, search, new Date("2026-08-10T12:00:00Z"));
  assert.ok(offer);
  assert.equal(offer.offerRole, "market_signal");
  assert.equal(offer.effectiveMonthly, null);
  assert.equal(offer.dueAtSigning, null);
  assert.ok(offer.parseConfidence < 0.8);
});

test("rejects mismatched vehicles, expired programs, and non-public source hosts", () => {
  const mismatched = structuredClone(incentive);
  mismatched.offer.vehicles[0].model = "RX";
  assert.equal(normalizeMarketCheckIncentive(mismatched, search, new Date("2026-08-10T12:00:00Z")), null);
  const expired = structuredClone(incentive);
  expired.offer.valid_through = "07/31/2026";
  assert.equal(normalizeMarketCheckIncentive(expired, search, new Date("2026-08-10T12:00:00Z")), null);
  const privateSource = structuredClone(incentive);
  privateSource.source = "127.0.0.1";
  assert.equal(normalizeMarketCheckIncentive(privateSource, search, new Date("2026-08-10T12:00:00Z")), null);
});

test("reports entitlement limits separately from bad credentials", async () => {
  const result = await runMarketCheckIncentivesAdapter({
    searches: [search],
    apiKey: "free-plan-key",
    minimumIntervalMs: 0,
    fetchImpl: async () => new Response(JSON.stringify({ code: 403 }), { status: 403 }),
  });
  assert.equal(result.offers.length, 0);
  assert.equal(result.run.source, "marketcheck_incentives");
  assert.equal(result.run.status, "unavailable");
  assert.equal(result.run.messageCode, "plan_upgrade_required");
});

test("fails closed when lease searches have no ZIP or the API credential is missing", async () => {
  let requested = false;
  const missingZip = await runMarketCheckIncentivesAdapter({
    searches: [{ ...search, zip: null }],
    apiKey: "test-key",
    fetchImpl: async () => { requested = true; throw new Error("must not fetch"); },
  });
  assert.equal(requested, false);
  assert.equal(missingZip.run.messageCode, "search_zip_missing");

  const missingKey = await runMarketCheckIncentivesAdapter({
    searches: [search],
    apiKey: null,
    fetchImpl: async () => { requested = true; throw new Error("must not fetch"); },
  });
  assert.equal(requested, false);
  assert.equal(missingKey.run.messageCode, "credential_missing");
});
