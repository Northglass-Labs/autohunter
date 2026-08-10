import type { ListingCard, SourceHealth } from "./dal";
import { createActionTokenPair } from "./action-token";

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

function sourceStatusLabel(source: SourceHealth) {
  if (source.messageCode) {
    const words = source.messageCode.split("_").join(" ");
    return words[0]?.toUpperCase() + words.slice(1);
  }
  if (source.status === "success") return `${source.acceptedCount} accepted`;
  if (source.status === "empty") return "Healthy, no matching results";
  return source.status[0]?.toUpperCase() + source.status.slice(1);
}

function sourceHealthBlock(sources: SourceHealth[]) {
  if (!sources.length) return "";
  const rows = sources.map((source) => {
    const healthy = source.status === "success" || source.status === "empty";
    return `<tr>
      <td style="padding:10px 0;border-top:1px solid #dfdce3;color:#242328;font-size:12px;font-weight:750">${escapeHtml(source.source)}</td>
      <td align="right" style="padding:10px 0 10px 12px;border-top:1px solid #dfdce3;color:${healthy ? "#13795f" : "#b06d08"};font-size:11px;font-weight:800">${escapeHtml(sourceStatusLabel(source))}</td>
    </tr>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:2px 0 22px;padding:0 2px">
    <tr><td colspan="2" style="padding:0 0 10px"><h2 style="margin:0 0 3px;color:#0a0a0a;font-size:19px;letter-spacing:-.025em">Source health</h2><p style="margin:0;color:#6d6a72;font-size:12px;line-height:1.45">The report stays explicit when a provider is unavailable, challenged, or under-entitled.</p></td></tr>
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
    <tr><td style="padding:22px 22px 24px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:11px;line-height:1.4;text-transform:uppercase;letter-spacing:.12em;font-weight:700;color:#776f62">${escapeHtml(listing.source)} · ${proximity}</td>
        <td align="right"><span style="display:inline-block;padding:6px 9px;border-radius:999px;background:#e5f2e9;color:#174b36;font-size:11px;font-weight:800">${escapeHtml(badge)}</span></td>
      </tr></table>
      <h2 style="margin:11px 0 6px;font-size:23px;line-height:1.22;letter-spacing:-.025em;color:#161714">${escapeHtml(listing.title)}</h2>
      <div style="font-size:30px;line-height:1.1;font-weight:800;letter-spacing:-.04em;color:#174b36">${headline}</div>
      <p style="margin:7px 0 12px;color:#655e53;font-size:15px;line-height:1.5">${escapeHtml(economics)}</p>
      ${packages}${featureEvidence}${safetyEvidence}
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
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
  const unavailableSources = sources.filter((source) => !["success", "empty"].includes(source.status));
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
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#fafafa;border:1px solid #d9d7d1;border-radius:18px"><tr><td style="padding:32px"><h2 style="margin:0 0 7px;font-size:23px;color:#0a0a0a">Nothing worthy made the cut.</h2><p style="margin:0;color:#6d6a72;line-height:1.55">The radar is still running. No stale repeats, no filler, and no invented terms.</p></td></tr></table>`;
  const onlyVerifiedManual = listings.length > 0 && listings.every((listing) => listing.offerKind === "used" && listing.verificationStatus === "verified");
  const countLabel = `${listings.length} ${onlyVerifiedManual ? "verified " : ""}find${listings.length === 1 ? "" : "s"}`;
  const brandName = config.brandName;
  const subject = listings.length
    ? `[${brandName}] ${listings.length} fresh ${onlyVerifiedManual ? "manual" : "vehicle"} find${listings.length === 1 ? "" : "s"}`
    : `[${brandName}] quiet run — no new verified finds`;
  const introduction = onlyVerifiedManual
    ? `Actual-car photos. Manual shifters checked. The best local finds at ${compactMoney(config.maxPrice)} or less.`
    : "Used, new, and lease opportunities normalized into one honest shortlist.";
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#e9e7e1;color:#0a0a0a;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9e7e1"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px"><tr><td style="padding:30px;background:#0a0a0a;border-radius:22px 22px 0 0;border:1px solid #252329;border-bottom:0"><table role="presentation" width="100%"><tr><td><div style="font-size:11px;text-transform:uppercase;letter-spacing:.16em;font-weight:800;color:#c7b7ff">DAILY DECISION REPORT · ${escapeHtml(scheduledFor)}</div><h1 style="margin:8px 0 8px;font-size:36px;line-height:1;letter-spacing:-.055em;color:#fafafa">${escapeHtml(brandName)}</h1><p style="margin:0;max-width:480px;line-height:1.5;color:#c7c3cc">${escapeHtml(introduction)}</p></td><td align="right" valign="bottom" style="font-size:13px;font-weight:800;color:#c7b7ff">${countLabel}</td></tr></table></td></tr><tr><td style="padding:22px;background:#f5f4f0;border:1px solid #d9d7d1;border-top:0;border-radius:0 0 22px 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#eee9ff;border-left:4px solid #795ee8;border-radius:0 14px 14px 0"><tr><td style="padding:17px 18px"><div style="margin:0 0 5px;color:#6550c7;font-size:10px;font-weight:850;letter-spacing:.13em;text-transform:uppercase">Bottom line</div><p style="margin:0;color:#242328;font-size:14px;font-weight:650;line-height:1.55">${escapeHtml(bottomLine)}</p></td></tr></table>${reportSections}${sourceHealthBlock(sources)}<table role="presentation" width="100%"><tr><td align="center" style="padding:18px 8px 6px"><a href="${escapeHtml(dashboardUrl)}" style="color:#6550c7;font-weight:800;text-decoration:none">Open your ${escapeHtml(brandName)} decision desk →</a><p style="margin:10px auto 0;max-width:510px;color:#6d6a72;font-size:11px;line-height:1.5">Interested and Pass first open a confirmation screen so automated email scanners cannot change your list.</p><p style="margin:18px auto 0;color:#9e9ba3;font-size:10px;font-weight:700;letter-spacing:.08em">a Northglass Product</p></td></tr></table></td></tr></table></td></tr></table></body></html>`;
  const text = listings.length
    ? `${brandName} daily decision report for ${scheduledFor}. ${bottomLine} Open your decision desk: ${dashboardUrl}${sources.length ? `\n\nSource health:\n${sources.map((source) => `- ${source.source}: ${source.status}${source.messageCode ? ` (${source.messageCode})` : ""}`).join("\n")}` : ""}`
    : `Nothing worthy made the ${brandName} cut today. ${bottomLine} Open your decision desk: ${dashboardUrl}${sources.length ? `\n\nSource health:\n${sources.map((source) => `- ${source.source}: ${source.status}${source.messageCode ? ` (${source.messageCode})` : ""}`).join("\n")}` : ""}`;

  return { subject, html, text, dashboardUrl };
}
