import { readBoundedJson } from "../app-client.mjs";

const NHTSA_API = "https://api.nhtsa.gov";
const MAX_RECALL_CAMPAIGNS = 10;

export function buildNhtsaRecallsUrl({ year, make, model }) {
  const url = new URL("/recalls/recallsByVehicle", NHTSA_API);
  url.searchParams.set("make", String(make));
  url.searchParams.set("model", String(model));
  url.searchParams.set("modelYear", String(year));
  return url;
}

export function buildNhtsaRatingsUrl({ year, make, model }) {
  return new URL(`/SafetyRatings/modelyear/${encodeURIComponent(year)}/make/${encodeURIComponent(make)}/model/${encodeURIComponent(model)}?format=json`, NHTSA_API);
}

export function buildNhtsaRatingDetailUrl(vehicleId) {
  const id = Number(vehicleId);
  if (!Number.isInteger(id) || id < 1 || id > 100_000_000) throw new Error("NHTSA vehicle ID must be a positive integer");
  return new URL(`/SafetyRatings/VehicleId/${id}?format=json`, NHTSA_API);
}

export async function enrichNhtsaSafety({
  offers,
  fetchImpl = fetch,
  maximumModelGroups = 5,
  maximumVariantsPerGroup = 2,
  minimumIntervalMs = 500,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now = new Date(),
}) {
  const startedAt = now.toISOString();
  const purchaseOffers = offers.filter(isEnrichablePurchase);
  const groups = uniqueModelGroups(purchaseOffers);
  const boundedGroups = Math.max(1, Math.min(25, Math.trunc(maximumModelGroups)));
  const boundedVariants = Math.max(1, Math.min(5, Math.trunc(maximumVariantsPerGroup)));
  const scheduled = groups.slice(0, boundedGroups);
  let requestCount = 0;
  let searchedCount = 0;
  let discoveredCount = 0;
  let acceptedCount = 0;
  let firstFailure = null;
  let failureCount = 0;

  const finish = (status, messageCode, enrichedOffers) => ({
    offers: enrichedOffers,
    run: {
      adapter: "nhtsa-safety-v1",
      source: "nhtsa",
      status,
      startedAt,
      finishedAt: new Date().toISOString(),
      searchedCount,
      discoveredCount,
      acceptedCount,
      messageCode,
    },
  });

  if (purchaseOffers.length === 0) return finish("empty", "no_purchase_offers", offers);

  const evidenceByGroup = new Map();
  for (const group of scheduled) {
    searchedCount += 1;
    const recallResponse = await requestJson(buildNhtsaRecallsUrl(group), { acceptEmpty400: true });
    if (!recallResponse.ok) {
      firstFailure ??= recallResponse.code;
      failureCount += 1;
      continue;
    }
    const ratingsResponse = await requestJson(buildNhtsaRatingsUrl(group));
    if (!ratingsResponse.ok) {
      firstFailure ??= ratingsResponse.code;
      failureCount += 1;
      continue;
    }

    const variants = array(ratingsResponse.value?.Results)
      .filter((variant) => positiveInteger(variant?.VehicleId) !== null)
      .slice(0, 25);
    const ratingRows = [];
    let detailFailures = 0;
    for (const variant of variants.slice(0, boundedVariants)) {
      const detailResponse = await requestJson(buildNhtsaRatingDetailUrl(variant.VehicleId));
      if (!detailResponse.ok) {
        firstFailure ??= detailResponse.code;
        failureCount += 1;
        detailFailures += 1;
        continue;
      }
      const row = array(detailResponse.value?.Results)[0];
      if (row && typeof row === "object") ratingRows.push(row);
    }
    if (variants.length > 0 && ratingRows.length === 0 && detailFailures > 0) continue;

    const recallRows = array(recallResponse.value?.results);
    const evidence = {
      source: "nhtsa",
      ratingStatus: hasAnyRating(ratingRows) ? "rated" : "not_rated",
      overallRating: conservativeRating(ratingRows, "OverallRating"),
      frontalCrashRating: conservativeRating(ratingRows, "OverallFrontCrashRating"),
      sideCrashRating: conservativeRating(ratingRows, "OverallSideCrashRating"),
      rolloverRating: conservativeRating(ratingRows, "RolloverRating"),
      availableVariantCount: variants.length,
      testedVariantCount: ratingRows.length,
      recallCampaignCount: boundedCount(recallResponse.value?.Count, recallRows.length),
      recallCampaigns: recallRows.slice(0, MAX_RECALL_CAMPAIGNS).map(normalizeCampaign).filter(Boolean),
      retrievedAt: now.toISOString(),
    };
    evidenceByGroup.set(modelGroupKey(group), evidence);
    discoveredCount += 1;
  }

  const enrichedOffers = offers.map((offer) => {
    const evidence = evidenceByGroup.get(modelGroupKey(offer));
    if (!evidence) return offer;
    acceptedCount += 1;
    return { ...offer, safetyEvidence: evidence };
  });

  if (discoveredCount === 0 && firstFailure) return finish("failed", firstFailure, enrichedOffers);
  const capCode = groups.length > scheduled.length ? `model_query_capped_${scheduled.length}of${groups.length}` : null;
  const partialCode = failureCount > 0 ? `partial_api_failure_${failureCount}` : null;
  return finish(discoveredCount > 0 ? "success" : "empty", capCode ?? partialCode, enrichedOffers);

  async function requestJson(url, { acceptEmpty400 = false } = {}) {
    if (requestCount > 0 && minimumIntervalMs > 0) await sleep(minimumIntervalMs);
    requestCount += 1;
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { Accept: "application/json", "User-Agent": "AutoHunter/1.0 (bounded NHTSA safety research)" },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      return { ok: false, code: "network_error" };
    }
    let value;
    try {
      value = await readBoundedJson(response, 2 * 1024 * 1024);
    } catch {
      return { ok: false, code: response.ok ? "invalid_json" : response.status === 429 ? "rate_limited" : `http_${response.status}` };
    }
    const acceptedEmpty = acceptEmpty400 && response.status === 400
      && Number(value?.Count) === 0 && Array.isArray(value?.results);
    if (!response.ok && !acceptedEmpty) return { ok: false, code: response.status === 429 ? "rate_limited" : `http_${response.status}` };
    return { ok: true, value };
  }
}

function uniqueModelGroups(offers) {
  const groups = new Map();
  for (const offer of offers) {
    const key = modelGroupKey(offer);
    if (!groups.has(key)) groups.set(key, { year: offer.year, make: offer.make, model: offer.model });
  }
  return [...groups.values()];
}

function modelGroupKey(value) {
  return [value?.year, normalized(value?.make), normalized(value?.model)].join("\u0000");
}

function isEnrichablePurchase(offer) {
  return offer?.offerKind !== "lease"
    && Number.isInteger(offer?.year)
    && offer.year >= 1990
    && typeof offer?.make === "string" && offer.make.trim()
    && typeof offer?.model === "string" && offer.model.trim();
}

function normalizeCampaign(value) {
  const campaignNumber = cleanText(value?.NHTSACampaignNumber, 30);
  const component = cleanText(value?.Component, 200);
  const reportReceivedDate = isoDate(value?.ReportReceivedDate);
  return campaignNumber && component && reportReceivedDate ? { campaignNumber, component, reportReceivedDate } : null;
}

function conservativeRating(rows, field) {
  const ratings = rows.map((row) => rating(row?.[field])).filter((value) => value !== null);
  return ratings.length ? Math.min(...ratings) : null;
}

function hasAnyRating(rows) {
  return ["OverallRating", "OverallFrontCrashRating", "OverallSideCrashRating", "RolloverRating"]
    .some((field) => conservativeRating(rows, field) !== null);
}

function rating(value) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : null;
}

function boundedCount(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100_000 ? parsed : fallback;
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isoDate(value) {
  const text = String(value ?? "").trim();
  const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (us) return `${us[3]}-${us[1]}-${us[2]}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function cleanText(value, max) {
  const result = String(value ?? "").replace(/\s+/g, " ").trim();
  return result ? result.slice(0, max) : null;
}

function normalized(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function array(value) {
  return Array.isArray(value) ? value : [];
}
