import type { ListingCard, SourceHealth } from "./dal";
import { createActionTokenPair } from "./action-token";
import { buyingChecksFor } from "./buying-checks";
import { isSourceHealthy, sourceLabel, sourceStatusLabel } from "./source-health-summary";

interface DigestEmailConfig {
  appUrl: string;
  recipientId: string;
  actionSecret: string;
  brandName: string;
  maxPrice: number;
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[
        character
      ]!,
  );
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function compactMoney(value: number) {
  return value % 1_000 === 0 ? `$${value / 1_000}k` : money(value);
}

function reportSection(title: string, note: string, listings: ListingCard[], config: DigestEmailConfig) {
  if (!listings.length) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
    <tr><td style="padding:0 2px 11px;border-bottom:2px solid #0a0a0a">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td><h2 style="margin:0 0 3px;color:#0a0a0a;font-size:19px;line-height:1.15;letter-spacing:-.025em">${escapeHtml(title)}</h2><p style="margin:0;color:#6d6a72;font-size:12px;line-height:1.45">${escapeHtml(note)}</p></td>
        <td align="right" valign="top" style="padding-left:12px;color:#6550c7;font-size:13px;font-weight:800">${listings.length}</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding-top:14px">${listings.map((listing) => listingCard(listing, config)).join("")}</td></tr>
  </table>`;
}

function sourceHealthBlock(sources: SourceHealth[]) {
  if (!sources.length) return "";
  const rows = sources.map((source) => {
    const healthy = isSourceHealthy(source);
    return `<tr>
      <td style="padding:10px 0;border-top:1px solid #dfdce3;color:#242328;font-size:12px;font-weight:750">${escapeHtml(sourceLabel(source.source))}</td>
      <td align="right" style="padding:10px 0 10px 12px;border-top:1px solid #dfdce3;color:${healthy ? "#13795f" : "#b06d08"};font-size:11px;font-weight:800">${escapeHtml(sourceStatusLabel(source))}</td>
    </tr>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:2px 0 22px;padding:0 2px">
    <tr><td colspan="2" style="padding:0 0 10px"><h2 style="margin:0 0 3px;color:#0a0a0a;font-size:19px;letter-spacing:-.025em">Source health</h2><p style="margin:0;color:#6d6a72;font-size:12px;line-height:1.45">A healthy result is at most 48 hours old. Coverage limits and stale feeds remain visible.</p></td></tr>
    ${rows}
  </table>`;
}

function listingCard(listing: ListingCard, config: DigestEmailConfig) {
  const actions = createActionTokenPair(
    { listingId: listing.id, recipientId: config.recipientId },
    config.actionSecret,
  );
  const actionBase = `${config.appUrl}/action?token=`;
  const image = listing.primaryImageUrl
    ? `<img src="${escapeHtml(listing.primaryImageUrl)}" alt="${escapeHtml(listing.title)}" width="640" style="display:block;width:100%;height:auto;max-height:360px;object-fit:cover;border:0">`
    : `<div style="height:180px;background:#dcd6c8;text-align:center;line-height:180px;color:#696255;font-size:13px">Listing photo unavailable</div>`;

  const lease = listing.offerKind === "lease";
  const buyingChecks = buyingChecksFor(listing);
  const priceChange = listing.priceChange !== null && listing.priceChange < 0
    ? `<p style="margin:8px 0;color:#13795f;font-size:13px;font-weight:750">${money(Math.abs(listing.priceChange))} price drop</p>` : "";
  const inspection = buyingChecks.length ? `<div style="margin:0 0 16px;padding:14px;background:#eee9ff;border-radius:10px;color:#4b4265;font-size:13px;line-height:1.55"><strong>Before you pursue this S-Class</strong><p style="margin:6px 0">${escapeHtml(buyingChecks[0])}</p><a href="${escapeHtml(`${config.appUrl}/guides/w222`)}" style="color:#6550c7;font-weight:750">Equipment and inspection checklist →</a></div>` : "";
  const proximity = listing.distanceMiles === null
    ? escapeHtml(listing.region ?? listing.location)
    : `${listing.distanceMiles.toFixed(0)} miles away`;
  const badge = lease
    ? listing.offerRole === "benchmark" ? "Comparison only"
      : listing.offerRole === "market_signal" ? "Research lead"
      : `${Math.round(listing.parseConfidence * 100)}% terms parsed`
    : listing.verificationStatus === "verified" ? "Manual verified" : listing.condition === "new" ? "New inventory" : "Purchase offer";
  const headline = lease
    ? listing.monthlyPayment === null ? "Terms in linked post" : `${money(listing.monthlyPayment)}/mo`
    : listing.price === null ? "Ask dealer" : money(listing.price);
  const economics = lease
    ? [
        listing.effectiveMonthly === null ? null : `${money(Math.round(listing.effectiveMonthly))} effective`,
        listing.dueAtSigning === null ? null : `${money(listing.dueAtSigning)} due at signing`,
        listing.termMonths === null ? null : `${listing.termMonths} months`,
        listing.annualMiles === null ? null : `${listing.annualMiles.toLocaleString()} miles/year`,
      ].filter(Boolean).join(" · ")
    : [
        listing.mileage === null ? null : `${listing.mileage.toLocaleString()} miles`,
        listing.location,
        listing.verificationStatus === "verified" ? `${Math.round(listing.manualConfidence * 100)}% photo confidence` : null,
        listing.garageGroup === "ev" || listing.garageGroup === "gas" ? `${Math.round(listing.familyFitScore)} family fit` : null,
        listing.featureMatchScore > 0 ? `${Math.round(listing.featureMatchScore)} feature match` : null,
        `deal score ${Math.round(listing.dealScore)}`,
      ].filter(Boolean).join(" · ");
  const packages = listing.packageNames.length
    ? `<p style="margin:0 0 9px;color:#4f493f;font-size:13px;line-height:1.45"><strong>Packages:</strong> ${escapeHtml(listing.packageNames.join(" · "))}</p>`
    : "";
  const featureRows = listing.featureEvidence.map((feature) => (
    `<span style="display:inline-block;margin:0 6px 6px 0;padding:6px 8px;border-radius:8px;background:${feature.status === "confirmed" ? "#e5f2e9" : "#f1ede4"};color:#4f493f;font-size:12px"><strong>${escapeHtml(feature.label)}</strong>: ${escapeHtml(feature.status)}</span>`
  )).join("");
  const featureEvidence = featureRows
    ? `<div style="margin:0 0 16px">${featureRows}${listing.featureEvidence.some((feature) => feature.status !== "confirmed") ? `<p style="margin:2px 0 0;color:#776f62;font-size:11px;line-height:1.45">Verify expected equipment on the listing or window sticker before treating it as present.</p>` : ""}</div>`
    : "";
  const safety = listing.safetyEvidence;
  const safetyEvidence = safety ? `<div style="margin:0 0 16px;padding:12px 13px;border-radius:10px;background:#f1edff;color:#4b4265;font-size:12px;line-height:1.5">
    <strong style="color:#2d273b">${safety.overallRating === null ? "NHTSA crash rating not available" : `NHTSA ${safety.overallRating}/5 overall`}</strong>
    <span style="display:block;margin-top:3px">${safety.recallCampaignCount} model-year recall campaign${safety.recallCampaignCount === 1 ? "" : "s"}. These do not establish whether this vehicle has an open recall.${listing.vin ? ` <a href="https://www.nhtsa.gov/recalls?vin=${encodeURIComponent(listing.vin)}" style="color:#6550c7;font-weight:750">Check this VIN at NHTSA →</a>` : ""}</span>
  </div>` : "";

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;background:#fffdf8;border:1px solid #d9d2c5;border-radius:18px;overflow:hidden;box-shadow:0 8px 24px rgba(41,34,23,.08)">
    <tr><td>${image}</td></tr>
    <tr><td class="email-card-body" style="padding:22px 22px 24px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:11px;line-height:1.4;text-transform:uppercase;letter-spacing:.12em;font-weight:700;color:#776f62">${escapeHtml(listing.source)} · ${proximity}</td>
        <td align="right"><span style="display:inline-block;padding:6px 9px;border-radius:999px;background:#e5f2e9;color:#174b36;font-size:11px;font-weight:800">${escapeHtml(badge)}</span></td>
      </tr></table>
      <h2 style="margin:11px 0 6px;font-size:23px;line-height:1.22;letter-spacing:-.025em;color:#161714">${escapeHtml(listing.title)}</h2>
      <div style="font-size:30px;line-height:1.1;font-weight:800;letter-spacing:-.04em;color:#174b36">${headline}</div>
      ${priceChange}
      <p style="margin:7px 0 12px;color:#655e53;font-size:15px;line-height:1.5">${escapeHtml(economics)}</p>
      ${packages}${featureEvidence}${inspection}${safetyEvidence}
      <table class="email-actions" role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="padding:0 8px 8px 0"><a href="${escapeHtml(listing.url)}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;padding:12px 16px;border-radius:10px;font-size:14px;font-weight:750">${lease && listing.offerRole === "active_offer" ? "View deal" : lease ? "Open source" : "View the car"} →</a></td>
        <td style="padding:0 8px 8px 0"><a href="${escapeHtml(actionBase + encodeURIComponent(actions.interested))}" style="display:inline-block;background:#dcefe3;color:#174b36;text-decoration:none;padding:12px 16px;border-radius:10px;font-size:14px;font-weight:750">Interested</a></td>
        <td style="padding:0 0 8px"><a href="${escapeHtml(actionBase + encodeURIComponent(actions.ignored))}" style="display:inline-block;background:#eeeae2;color:#504a41;text-decoration:none;padding:12px 16px;border-radius:10px;font-size:14px;font-weight:750">Pass</a></td>
      </tr></table>
    </td></tr>
  </table>`;
}

export function renderDigestEmail(
  listings: ListingCard[],
  scheduledFor: string,
  config: DigestEmailConfig,
  sources: SourceHealth[] = [],
) {
  const dashboardUrl = `${config.appUrl}/`;
  const purchases = listings.filter((listing) => listing.offerKind !== "lease");
  const activeLeases = listings.filter((listing) => listing.offerKind === "lease" && listing.offerRole === "active_offer");
  const benchmarks = listings.filter((listing) => listing.offerKind === "lease" && listing.offerRole === "benchmark");
  const signals = listings.filter((listing) => listing.offerKind === "lease" && listing.offerRole === "market_signal");
  const unavailableSources = sources.filter((source) => !isSourceHealthy(source));
  const bottomLine = listings.length
    ? `${purchases.length} purchase candidate${purchases.length === 1 ? "" : "s"} and ${activeLeases.length} live lease offer${activeLeases.length === 1 ? "" : "s"} cleared your filters.${benchmarks.length || signals.length ? ` ${benchmarks.length} signed benchmark${benchmarks.length === 1 ? "" : "s"} and ${signals.length} market signal${signals.length === 1 ? "" : "s"} are context only.` : ""}${unavailableSources.length ? ` ${unavailableSources.length} source${unavailableSources.length === 1 ? " is" : "s are"} not fully available.` : ""}`
    : `No new or meaningfully changed candidates cleared your filters.${unavailableSources.length ? ` ${unavailableSources.length} source${unavailableSources.length === 1 ? " is" : "s are"} not fully available.` : ""}`;
  const reportSections = listings.length
    ? [
        reportSection("Fresh & changed vehicle finds", "Used and new listings with original photos, source links, and equipment evidence", purchases, config),
        reportSection("Active lease offers", "Current programs with complete enough terms to normalize", activeLeases, config),
        reportSection("Signed benchmarks", "Negotiation context—not live inventory", benchmarks, config),
        reportSection("Market signals", "Leads with incomplete economics; verify before comparing", signals, config),
      ].join("")
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#fafafa;border:1px solid #d9d7d1;border-radius:18px"><tr><td style="padding:32px"><h2 style="margin:0 0 7px;font-size:23px;color:#0a0a0a">No new matches today.</h2><p style="margin:0;color:#6d6a72;line-height:1.55">No new or meaningfully changed candidates cleared your filters. Check source health below for any gaps in coverage.</p></td></tr></table>`;
  const onlyVerifiedManual = listings.length > 0 && listings.every((listing) => listing.offerKind === "used" && listing.verificationStatus === "verified");
  const countLabel = `${listings.length} ${onlyVerifiedManual ? "verified " : ""}find${listings.length === 1 ? "" : "s"}`;
  const brandName = config.brandName;
  const subject = listings.length
    ? `[${brandName}] ${listings.length} fresh ${onlyVerifiedManual ? "manual" : "vehicle"} find${listings.length === 1 ? "" : "s"}`
    : `[${brandName}] no new matches`;
  const introduction = onlyVerifiedManual
    ? `Actual-car photos. Manual shifters checked. The best local finds at ${compactMoney(config.maxPrice)} or less.`
    : "Used, new, and lease opportunities normalized into one honest shortlist.";
  const preview = listings.length
    ? `${listings[0].title} · ${listings[0].offerKind === "lease" ? listings[0].monthlyPayment === null ? "Terms linked" : `${money(listings[0].monthlyPayment)}/mo` : listings[0].price === null ? "Ask dealer" : money(listings[0].price)}. ${bottomLine}`
    : bottomLine;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">
    <style>@media only screen and (max-width:480px){.email-shell{padding:12px 6px!important}.email-header{padding:24px 18px!important}.email-content{padding:14px!important}.email-card-body{padding:18px 14px!important}.email-actions td{display:block!important;padding:0 0 8px!important}.email-actions a{display:block!important;text-align:center}.email-actions{width:100%!important}}</style>
    </head><body style="margin:0;background:#e9e7e1;color:#0a0a0a;font-family:Arial,Helvetica,sans-serif">
    <div class="preview-text" style="display:none;max-height:0;overflow:hidden;mso-hide:all;color:#e9e7e1;font-size:1px;line-height:1px">${escapeHtml(preview)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9e7e1"><tr><td class="email-shell" align="center" style="padding:28px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px">
    <tr><td class="email-header" style="padding:30px;background:#0a0a0a;border-radius:22px 22px 0 0;border:1px solid #252329;border-bottom:0">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.14em;font-weight:800;color:#c7b7ff">YOUR DAILY SHORTLIST · ${escapeHtml(scheduledFor)}</div>
      <h1 style="margin:10px 0;font-size:36px;line-height:1;letter-spacing:-.055em;color:#fafafa">${escapeHtml(brandName)}</h1>
      <p style="margin:0;max-width:480px;line-height:1.5;color:#c7c3cc">${escapeHtml(introduction)}</p>
      <div style="margin-top:16px;color:#c7b7ff;font-size:13px;font-weight:750">${countLabel}</div>
    </td></tr>
    <tr><td class="email-content" style="padding:22px;background:#f5f4f0;border:1px solid #d9d7d1;border-top:0;border-radius:0 0 22px 22px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#eee9ff;border-left:4px solid #795ee8;border-radius:0 14px 14px 0"><tr><td style="padding:17px 18px">
        <p style="margin:0;color:#242328;font-size:14px;line-height:1.55">${escapeHtml(bottomLine)}</p>
        <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;margin-top:10px;color:#6550c7;font-size:13px;font-weight:750;text-decoration:none">Review your queue →</a>
      </td></tr></table>
      ${reportSections}${sourceHealthBlock(sources)}
      <table role="presentation" width="100%"><tr><td align="center" style="padding:18px 8px 6px">
        <a href="${escapeHtml(dashboardUrl)}" style="color:#6550c7;font-weight:800;text-decoration:none">Open your ${escapeHtml(brandName)} decision desk →</a>
        <p style="margin:10px auto 0;max-width:510px;color:#6d6a72;font-size:12px;line-height:1.5">Check price, availability and equipment with the seller. Interested and Pass open a confirmation screen before changing your list.</p>
        <p style="margin:18px auto 0;color:#6d6a72;font-size:11px;font-weight:700;letter-spacing:.04em">a Northglass Product</p>
      </td></tr></table>
    </td></tr></table></td></tr></table></body></html>`;
  const text = [
    `${brandName} daily shortlist · ${scheduledFor}`,
    bottomLine,
    ...listings.map((listing) => plainTextListing(listing, config.appUrl)),
    `Open your decision desk: ${dashboardUrl}`,
    sources.length ? `Source health (results older than 48 hours are stale):\n${sources.map((source) => `- ${sourceLabel(source.source)}: ${source.status} · ${sourceStatusLabel(source)}`).join("\n")}` : "",
    "Check price, availability and equipment with the seller.\na Northglass Product",
  ].filter(Boolean).join("\n\n");

  return { subject, html, text, dashboardUrl };
}

function plainTextListing(listing: ListingCard, appUrl: string) {
  const lease = listing.offerKind === "lease";
  const price = lease
    ? [listing.monthlyPayment === null ? "Payment unknown" : `${money(listing.monthlyPayment)}/mo`,
      listing.effectiveMonthly === null ? "Effective cost unknown" : `${money(Math.round(listing.effectiveMonthly))}/mo effective`,
      listing.dueAtSigning === null ? null : `${money(listing.dueAtSigning)} due at signing`,
      listing.termMonths === null ? null : `${listing.termMonths} months`,
      listing.annualMiles === null ? null : `${listing.annualMiles.toLocaleString()} miles/year`].filter(Boolean).join(" · ")
    : [listing.price === null ? "Ask dealer" : money(listing.price), listing.mileage === null ? "Mileage unknown" : `${listing.mileage.toLocaleString()} miles`].join(" · ");
  const context = lease ? listing.offerRole === "benchmark" ? "Signed benchmark · comparison only" : listing.offerRole === "market_signal" ? "Market signal · research lead" : "Active lease offer" : "Purchase candidate";
  const checks = buyingChecksFor(listing);
  return [
    `${listing.title}\n${context} · ${price}`,
    listing.priceChange !== null && listing.priceChange < 0 ? `${money(Math.abs(listing.priceChange))} price drop` : null,
    [listing.sellerName, listing.region ?? listing.location, listing.distanceMiles === null ? null : `${Math.round(listing.distanceMiles)} miles away`].filter(Boolean).join(" · "),
    listing.packageNames.length ? `Listed packages: ${listing.packageNames.join(", ")}` : null,
    ...listing.featureEvidence.map((feature) => `${feature.label}: ${feature.status} — ${feature.evidence}`),
    ...checks,
    checks.length ? `S-Class buying guide: ${appUrl}/guides/w222` : null,
    listing.safetyEvidence ? `${listing.safetyEvidence.recallCampaignCount} model-year recall campaigns; check this VIN for open status.` : null,
    listing.url,
  ].filter(Boolean).join("\n");
}
