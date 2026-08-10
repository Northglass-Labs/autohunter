import { createHash } from "node:crypto";
import { isIP } from "node:net";

const MAX_MESSAGES = 100;
const MAX_BODY_CHARS = 100_000;

export function parseAuthorizedEmailAlerts(messages, searches, now = new Date()) {
  if (!Array.isArray(messages) || !Array.isArray(searches)) return [];
  const offers = [];
  const seen = new Set();
  const leaseSearches = searches.filter((search) => search.offerKind === "lease" && search.active !== false);
  for (const message of messages.slice(0, MAX_MESSAGES)) {
    const id = cleanText(message?.id, 200);
    const subject = cleanText(message?.subject, 300);
    const body = cleanText(message?.body, MAX_BODY_CHARS);
    if (!id || !subject || !body) continue;
    for (const candidate of emailOfferCandidates(subject, body)) {
      const { text: combined, url } = candidate;
      for (const search of leaseSearches) {
        if (!matchesSearch(combined, search)) continue;
        const economics = leaseEconomics(combined);
        const offerRole = inferredOfferRole(combined, message?.from, url, economics.complete);
        if (!economics.complete && offerRole !== "market_signal" && offerRole !== "benchmark") continue;
        if (offerRole === "active_offer") {
          if (search.maxEffectiveMonthly && economics.effectiveMonthly > search.maxEffectiveMonthly) continue;
          if (search.maxDueAtSigning !== null && search.maxDueAtSigning !== undefined && economics.dueAtSigning > search.maxDueAtSigning) continue;
          if (search.minAnnualMiles && economics.annualMiles < search.minAnnualMiles) continue;
        }

        const key = createHash("sha256").update(`${id}\u0000${search.id}\u0000${url}`).digest("hex").slice(0, 32);
        if (seen.has(key)) continue;
        seen.add(key);
        const publishedAt = parsedUtcDate(message.date) ?? now;
        const parsedUrl = new URL(url);
        const year = boundedYear(combined.match(/\b(20\d{2})\b/)?.[1]);
        offers.push({
          offerKind: "lease",
          condition: "new",
          offerRole,
          sourceMethod: "authorized_email",
          source: "email_alert",
          originSource: parsedUrl.hostname.replace(/^www\./, ""),
          sourceListingId: `gmail:${key}`,
          searchId: search.id,
          url,
          year,
          make: search.make,
          model: search.model,
          trim: search.trim ?? null,
          title: candidate.title ?? subject,
          price: null,
          mileage: null,
          distanceMiles: null,
          location: search.region,
          transmissionClaim: null,
          imageUrls: [],
          primaryImageUrl: null,
          marketEstimate: null,
          monthlyPayment: economics.monthlyPayment,
          dueAtSigning: economics.dueAtSigning,
          dueAtSigningIncludesFirstPayment: economics.dueAtSigningIncludesFirstPayment,
          termMonths: economics.termMonths,
          annualMiles: economics.annualMiles,
          brokerFee: economics.brokerFee,
          acquisitionFee: economics.acquisitionFee,
          acquisitionFeeIncludedInDueAtSigning: economics.acquisitionFeeIncludedInDueAtSigning,
          dispositionFee: economics.dispositionFee,
          securityDeposit: economics.securityDeposit,
          securityDepositRefundable: economics.securityDepositRefundable,
          msrp: economics.msrp,
          moneyFactor: economics.moneyFactor,
          residualPercent: economics.residualPercent,
          discountPercent: economics.discountPercent,
          taxesIncluded: economics.taxesIncluded,
          effectiveMonthly: economics.effectiveMonthly,
          region: search.region,
          parseConfidence: economics.parseConfidence,
          sellerName: senderName(message.from),
          requiresManualVerification: false,
          manualEvidence: [],
          garageGroup: "lease",
          powertrainCategory: search.powertrainCategory ?? "any",
          featureEvidence: [],
          packageNames: [],
          featureMatchScore: 0,
          familyFitScore: 0,
          enrichmentStatus: "not_requested",
          publishedAt: publishedAt.toISOString(),
          expiresAt: new Date(publishedAt.getTime() + retentionDays(offerRole) * 86_400_000).toISOString(),
        });
      }
    }
  }
  return offers;
}

export async function runEmailAlertAdapter({ messages, searches }) {
  const startedAt = new Date().toISOString();
  const relevant = searches.filter((search) => search.offerKind === "lease" && search.active !== false);
  const offers = parseAuthorizedEmailAlerts(messages, relevant);
  return {
    offers,
    run: {
      adapter: "gog-authorized-email-v1",
      source: "email_alert",
      status: offers.length ? "success" : "empty",
      startedAt,
      finishedAt: new Date().toISOString(),
      searchedCount: relevant.length,
      discoveredCount: Math.min(Array.isArray(messages) ? messages.length : 0, MAX_MESSAGES),
      acceptedCount: offers.length,
      messageCode: offers.length ? null : relevant.length ? "no_matching_messages" : "no_matching_searches",
    },
  };
}

function matchesSearch(value, search) {
  const haystack = normalized(value);
  if (!includesTerm(haystack, search.make)) return false;
  return [search.model, ...(search.aliases ?? [])].some((candidate) => includesTerm(haystack, candidate));
}

function includesTerm(haystack, candidate) {
  const term = normalized(candidate);
  return Boolean(term) && ` ${haystack} `.includes(` ${term} `);
}

function leaseEconomics(value) {
  const monthlyPayment = moneyNear(value, /(?:\/\s*mo(?:nth)?|monthly|per\s+month)\b/i);
  const onePay = labeledMoney(value, /one[ -]?pay/i);
  const dueAtSigningLabel = /(?:DAS|due\s+at\s+signing|drive[ -]?off)/i;
  const dueAtSigning = labeledMoney(value, dueAtSigningLabel) ?? labeledZero(value, dueAtSigningLabel) ?? onePay;
  const termMileage = value.match(/\b(\d{2})\s*(?:months?|mos?)?\s*[\/|]\s*(\d{1,2})(k)?\b/i);
  const termMonths = termMileage
    ? Number(termMileage[1])
    : boundedInteger(value.match(/\b(\d{2})\s*(?:months?|mos?)\b/i)?.[1], 1, 120);
  const annualMiles = termMileage
    ? Number(termMileage[2]) * (termMileage[3] || Number(termMileage[2]) < 100 ? 1_000 : 1)
    : mileagePerYear(value);
  const brokerFee = labeledMoney(value, /broker(?:\s+fee)?/i);
  const acquisitionFee = labeledMoney(value, /acq(?:uisition)?(?:\s+fee)?/i);
  const acquisitionFeeIncludedInDueAtSigning = acquisitionFee === null
    ? null
    : /(?:acq(?:uisition)?\s+fee).{0,50}(?:included\s+in|part\s+of).{0,30}(?:DAS|due\s+at\s+signing)|(?:DAS|due\s+at\s+signing).{0,50}includes?.{0,30}(?:acq(?:uisition)?\s+fee)/i.test(value);
  const dispositionFee = labeledMoney(value, /disposition(?:\s+fee)?/i);
  const securityDeposit = labeledMoney(value, /(?:MSDs?|multiple\s+security\s+deposits?|security\s+deposits?)/i);
  const securityDepositRefundable = securityDeposit === null
    ? null
    : /\bMSDs?\b|\brefundable\s+(?:multiple\s+)?security\s+deposits?\b/i.test(value)
      ? true
      : /\bnon[ -]?refundable\s+(?:multiple\s+)?security\s+deposits?\b/i.test(value)
        ? false
        : null;
  const msrp = labeledMoney(value, /MSRP/i);
  const moneyFactor = boundedNumber(value.match(/\b(?:MF|money\s+factor)\s*[:=]?\s*(0?\.\d{3,6})\b/i)?.[1], 0, 1);
  const residualPercent = boundedNumber(value.match(/\b(\d{1,2}(?:\.\d+)?)%\s*(?:residual|RV)\b/i)?.[1], 0, 100);
  const discountPercent = boundedNumber(value.match(/\b(\d{1,2}(?:\.\d+)?)%\s*off(?:\s+MSRP)?\b/i)?.[1], 0, 100);
  const taxesIncluded = /\b(?:tax(?:es)?\s+included|incl\.?\s+tax)\b/i.test(value)
    ? true
    : /(?:\+\s*tax|plus\s+tax)/i.test(value) ? false : null;
  const complete = (monthlyPayment !== null || onePay !== null) && dueAtSigning !== null && termMonths !== null && annualMiles !== null;
  const dueAtSigningIncludesFirstPayment = dueAtSigning === null
    ? null
    : onePay === null && (dueAtSigning === 0 || /(?:excludes?|does\s+not\s+include)\s+(?:the\s+)?first\s+payment|first\s+payment\s+(?:additional|extra)|plus\s+(?:the\s+)?first\s+payment/i.test(value))
      ? false
      : true;
  const nonRefundableDeposit = securityDepositRefundable === false ? securityDeposit ?? 0 : 0;
  const effectiveMonthly = complete
    ? Math.round((((monthlyPayment ?? 0) * (termMonths - (dueAtSigningIncludesFirstPayment === false ? 0 : 1))
      + dueAtSigning + (brokerFee ?? 0) + (acquisitionFee ?? 0) + nonRefundableDeposit) / termMonths) * 100) / 100
    : null;
  let parseConfidence = complete ? 0.85 : 0.25;
  if (msrp !== null) parseConfidence += 0.1;
  if (brokerFee !== null || acquisitionFee !== null) parseConfidence += 0.05;
  parseConfidence = Math.min(1, Math.round(parseConfidence * 100) / 100);
  return {
    complete,
    monthlyPayment,
    dueAtSigning,
    termMonths,
    annualMiles,
    brokerFee,
    acquisitionFee,
    acquisitionFeeIncludedInDueAtSigning,
    dispositionFee,
    securityDeposit,
    securityDepositRefundable,
    msrp,
    moneyFactor,
    residualPercent,
    discountPercent,
    taxesIncluded,
    dueAtSigningIncludesFirstPayment,
    effectiveMonthly,
    parseConfidence,
  };
}

function inferredOfferRole(value, from, url, complete) {
  if (/\b(?:deal\s+)?signed\b|\bsigned\s+(?:deal|lease)\b|\bdelivered\b/i.test(value)) return "benchmark";
  if (complete) return "active_offer";
  return isOfficialLeasehackrMessage(from, url) ? "market_signal" : "active_offer";
}

function isOfficialLeasehackrMessage(from, url) {
  const sender = cleanText(from, 300) ?? "";
  if (/@(?:[a-z0-9-]+\.)*leasehackr\.com\b/i.test(sender)) return true;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === "leasehackr.com" || hostname.endsWith(".leasehackr.com");
  } catch {
    return false;
  }
}

function retentionDays(role) {
  if (role === "benchmark") return 90;
  if (role === "market_signal") return 35;
  return 14;
}

function moneyNear(value, suffix) {
  for (const line of value.split(/\r?\n/)) {
    const match = line.match(new RegExp(`\\$\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*${suffix.source}`, "i"));
    if (match) return money(match[1]);
  }
  return null;
}

function labeledMoney(value, label) {
  const amount = "\\$\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*(k)?";
  for (const line of value.split(/\r?\n/)) {
    const after = line.match(new RegExp(`${amount}\\s*(?:${label.source})`, "i"));
    if (after) return money(after[1], Boolean(after[2]));
    const before = line.match(new RegExp(`(?:${label.source})\\s*[:=\\-]?\\s*${amount}`, "i"));
    if (before) return money(before[1], Boolean(before[2]));
  }
  return null;
}

function labeledZero(value, label) {
  for (const line of value.split(/\r?\n/)) {
    const before = line.match(new RegExp(`(?:${label.source})\\s*[:=\\-]?\\s*\\$?\\s*0(?:\\.00)?\\b`, "i"));
    if (before) return 0;
    const after = line.match(new RegExp(`(?:^|\\s)\\$?\\s*0(?:\\.00)?\\s*(?:${label.source})\\b`, "i"));
    if (after) return 0;
  }
  return null;
}

function mileagePerYear(value) {
  const match = value.match(/\b([\d,]+)\s*(k)?\s*(?:miles?|mi)\s*(?:\/\s*(?:yr|year)|per\s+year|annually)\b/i);
  if (!match) return null;
  const result = Number(match[1].replace(/,/g, "")) * (match[2] ? 1_000 : 1);
  return Number.isInteger(result) && result >= 1_000 && result <= 100_000 ? result : null;
}

function money(value, thousands = false) {
  if (!value) return null;
  const result = Number(String(value).replace(/,/g, "")) * (thousands ? 1_000 : 1);
  return Number.isFinite(result) && result >= 0 && result <= 10_000_000 ? Math.round(result) : null;
}

function bestOfferUrl(value) {
  const urls = value.match(/https:\/\/[^\s<>"']+/gi) ?? [];
  for (const raw of urls) {
    const sanitized = publicOfferUrl(raw.replace(/[),.;]+$/, ""));
    if (sanitized && isOfferUrl(sanitized)) return sanitized;
  }
  return null;
}

function emailOfferCandidates(subject, body) {
  const combined = `${subject}\n${body}`;
  const referenceLinks = referenceMarkdownLinks(combined);
  const markdownLinks = [...referenceLinks.links];
  const expression = /\[([^\]\r\n]{1,500})\]\((https:\/\/[^\s)]+)\)/gi;
  for (const match of combined.matchAll(expression)) {
    const url = publicOfferUrl(match[2]);
    if (!url || !isOfferUrl(url)) continue;
    markdownLinks.push({
      index: match.index ?? 0,
      title: cleanText(match[1], 300),
      url,
    });
  }
  markdownLinks.sort((left, right) => left.index - right.index);

  const uniqueLinks = [];
  const seenUrls = new Set();
  for (const link of markdownLinks) {
    if (seenUrls.has(link.url)) continue;
    seenUrls.add(link.url);
    uniqueLinks.push(link);
  }
  if (uniqueLinks.length === 0) {
    const url = bestOfferUrl(combined);
    return url ? [{ text: combined, title: subject, url }] : [];
  }
  if (uniqueLinks.length === 1) {
    return [{ text: combined, title: uniqueLinks[0].title ?? subject, url: uniqueLinks[0].url }];
  }
  return uniqueLinks.map((link, index) => ({
    text: `${subject}\n${combined.slice(link.index, uniqueLinks[index + 1]?.index ?? referenceLinks.contentEnd)}`,
    title: link.title ?? subject,
    url: link.url,
  }));
}

function referenceMarkdownLinks(value) {
  const definitions = new Map();
  let contentEnd = value.length;
  const definitionExpression = /^\s*\[(\d+)\]:\s*(https:\/\/\S+)\s*$/gm;
  for (const match of value.matchAll(definitionExpression)) {
    contentEnd = Math.min(contentEnd, match.index ?? contentEnd);
    if (!definitions.has(match[1])) definitions.set(match[1], match[2]);
  }
  if (definitions.size === 0) return { contentEnd, links: [] };

  const links = [];
  const content = value.slice(0, contentEnd);
  const lineExpression = /^.*$/gm;
  for (const lineMatch of content.matchAll(lineExpression)) {
    const line = lineMatch[0];
    const linkExpression = /\[([^\r\n]+)\]\[(\d+)\]/g;
    for (const match of line.matchAll(linkExpression)) {
      const rawUrl = definitions.get(match[2]);
      const url = rawUrl ? publicOfferUrl(rawUrl) : null;
      if (!url || !isOfferUrl(url)) continue;
      links.push({
        index: (lineMatch.index ?? 0) + (match.index ?? 0),
        title: cleanText(match[1], 300),
        url,
      });
    }
  }
  return { contentEnd, links };
}

function publicOfferUrl(value, depth = 0) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) return null;
    if (isIP(hostname) && privateIp(hostname)) return null;
    if ((hostname === "engage.squarespace-mail.com" || hostname.endsWith(".engage.squarespace-mail.com")) && url.pathname === "/r") {
      const destination = url.searchParams.get("u");
      return destination && depth < 3 ? publicOfferUrl(destination, depth + 1) : null;
    }
    if (/unsubscribe|optout|preferences|privacy|tracking|click\./i.test(`${hostname}${url.pathname}`)) return null;
    for (const name of [...url.searchParams.keys()]) {
      if (/^(?:utm_|ss_)/i.test(name) || /^(gclid|fbclid|mc_cid|mc_eid|api_key)$/i.test(name)) url.searchParams.delete(name);
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function isOfferUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (url.pathname === "/" || !url.pathname) return false;
    if (hostname === "leasehackr-assets.b-cdn.net" || /\.(?:avif|gif|jpe?g|pdf|png|svg|webp|zip)$/i.test(url.pathname)) return false;
    if (hostname === "forum.leasehackr.com") return url.pathname.startsWith("/t/");
    return true;
  } catch {
    return false;
  }
}

function privateIp(hostname) {
  if (hostname === "::1") return true;
  if (hostname.includes(":")) return /^(?:fc|fd|fe8|fe9|fea|feb)/i.test(hostname);
  const [first, second] = hostname.split(".").map(Number);
  return first === 10 || first === 127 || first === 0 || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

function senderName(value) {
  const raw = cleanText(value, 200);
  if (!raw) return null;
  const name = raw.match(/^\s*([^<]+?)\s*</)?.[1]?.replace(/^"|"$/g, "").trim();
  return name || null;
}

function parsedUtcDate(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalizedValue = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(value.trim())
    ? `${value.trim().replace(" ", "T")}Z`
    : value.trim();
  const result = new Date(normalizedValue);
  return Number.isNaN(result.getTime()) ? null : result;
}

function boundedYear(value) {
  return boundedInteger(value, 1886, 2100);
}

function boundedInteger(value, min, max) {
  const result = Number(value);
  return Number.isInteger(result) && result >= min && result <= max ? result : null;
}

function boundedNumber(value, min, max) {
  const result = Number(value);
  return Number.isFinite(result) && result >= min && result <= max ? result : null;
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return null;
  const result = value.replace(/\u0000/g, "").trim();
  return result ? result.slice(0, maxLength) : null;
}

function normalized(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
