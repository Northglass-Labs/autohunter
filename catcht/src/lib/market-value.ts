// What a used car is worth, from comparable listings AutoHunter has already collected (ADR-023).
// Comparables share the make and model, sit within one model year, and are adjusted to the
// target's model year and mileage before the median is taken. No provider supplies this value.

export interface MarketComparable {
  year: number;
  trim: string | null;
  price: number;
  mileage: number;
}

export interface MarketTarget {
  year: number;
  trim: string | null;
  mileage: number;
}

export type MarketBasis = "trim" | "trim_family" | "model";

export interface MarketEstimate {
  estimate: number;
  comparables: number;
  basis: MarketBasis;
  // Median absolute deviation of the adjusted comparable prices, as a percentage of the estimate.
  spreadPercent: number;
}

export const MIN_TRIM_COMPARABLES = 5;
export const MIN_MODEL_COMPARABLES = 8;
// A listing below this share of its estimate, or below the absolute floor, is a data error such as
// a down payment or monthly payment in the price field, not a deal.
export const IMPLAUSIBLE_PRICE_SHARE = 0.45;
export const IMPLAUSIBLE_PRICE_FLOOR = 1_000;

const YEAR_RATE = Math.log(1.08);
const DEFAULT_MILEAGE_RATE = 0.005 / 1_000;
const MIN_MILEAGE_RATE = 0.001 / 1_000;
const MAX_MILEAGE_RATE = 0.015 / 1_000;
const MIN_FIT_COMPARABLES = 12;
const MIN_FIT_MILEAGE_SPREAD = 5_000;
// Comparable prices this far from their median are excluded before any estimate.
const LOW_OUTLIER_SHARE = 0.45;
const HIGH_OUTLIER_SHARE = 2.2;

const DRIVETRAIN_AND_BODY_WORDS = /\b(awd|4wd|fwd|rwd|4x4|4matic\+?|quattro|sedan|suv|coupe|wagon|4dr|4d|4-door|sport utility)\b/g;

// A comparable trim key: lowercase letters and digits, without drivetrain or body words and
// without anything a dealer appended after "w/".
export function trimKey(trim: string | null | undefined) {
  if (!trim) return "";
  return trim.toLowerCase()
    .split(/\bw\/|\bwith\b/)[0]
    .replace(DRIVETRAIN_AND_BODY_WORDS, " ")
    .replace(/[^a-z0-9]+/g, "");
}

export function isImplausiblePrice(price: number, estimate: number | null | undefined) {
  if (!Number.isFinite(price) || price < IMPLAUSIBLE_PRICE_FLOOR) return true;
  return estimate !== null && estimate !== undefined && estimate > 0 && price < estimate * IMPLAUSIBLE_PRICE_SHARE;
}

// A price this far below its estimate is shown with a prompt to check the title and history: it is
// plausible enough to list, but branded titles and damage often explain it.
export const UNUSUAL_DISCOUNT_PERCENT = 20;

export interface MarketPosition {
  tone: "below" | "at" | "above" | "unusual";
  text: string;
}

// One plain sentence comparing a price with its estimate, for cards and reports.
export function describeMarketPosition(
  price: number | null | undefined,
  estimate: number | null | undefined,
  comparables: number | null | undefined,
): MarketPosition | null {
  if (price === null || price === undefined || !estimate || estimate <= 0) return null;
  const compared = comparables ? ` (${comparables} compared)` : "";
  const gap = estimate - price;
  const percent = (gap / estimate) * 100;
  const dollars = Math.abs(Math.round(gap / 50) * 50).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  if (Math.abs(percent) < 1) return { tone: "at", text: `In line with similar cars${compared}` };
  if (percent >= UNUSUAL_DISCOUNT_PERCENT) {
    return { tone: "unusual", text: `${dollars} (${Math.round(percent)}%) below similar cars${compared}. Unusually low: check title and history.` };
  }
  return gap > 0
    ? { tone: "below", text: `${dollars} below similar cars${compared}` }
    : { tone: "above", text: `${dollars} above similar cars${compared}` };
}

export function estimateMarketValue(target: MarketTarget, comparables: readonly MarketComparable[]): MarketEstimate | null {
  const nearby = comparables.filter((comparable) => Number.isFinite(comparable.price) && comparable.price > 0
    && Number.isFinite(comparable.mileage) && comparable.mileage >= 0
    && Math.abs(comparable.year - target.year) <= 1);
  const selected = selectComparables(target, nearby);
  if (!selected) return null;

  const rawMedian = median(selected.comparables.map((comparable) => comparable.price));
  const kept = selected.comparables.filter((comparable) => comparable.price >= rawMedian * LOW_OUTLIER_SHARE
    && comparable.price <= rawMedian * HIGH_OUTLIER_SHARE);
  if (kept.length < selected.minimum) return null;

  const yearAdjusted = kept.map((comparable) => ({
    mileage: comparable.mileage,
    price: comparable.price * Math.exp(YEAR_RATE * (target.year - comparable.year)),
  }));
  const rate = mileageRate(yearAdjusted);
  const adjusted = yearAdjusted.map((comparable) => comparable.price * Math.exp(rate * (comparable.mileage - target.mileage)));
  const estimate = median(adjusted);
  const spread = median(adjusted.map((price) => Math.abs(price - estimate)));
  return {
    estimate: Math.round(estimate / 50) * 50,
    comparables: kept.length,
    basis: selected.basis,
    spreadPercent: Math.round((spread / estimate) * 1_000) / 10,
  };
}

function selectComparables(target: MarketTarget, comparables: MarketComparable[]) {
  const key = trimKey(target.trim);
  if (key) {
    const sameTrim = comparables.filter((comparable) => trimKey(comparable.trim) === key);
    if (sameTrim.length >= MIN_TRIM_COMPARABLES) {
      return { basis: "trim" as const, comparables: sameTrim, minimum: MIN_TRIM_COMPARABLES };
    }
    const family = comparables.filter((comparable) => {
      const other = trimKey(comparable.trim);
      return other !== "" && (other.includes(key) || key.includes(other));
    });
    if (family.length >= MIN_TRIM_COMPARABLES) {
      return { basis: "trim_family" as const, comparables: family, minimum: MIN_TRIM_COMPARABLES };
    }
  }
  if (comparables.length >= MIN_MODEL_COMPARABLES) {
    return { basis: "model" as const, comparables, minimum: MIN_MODEL_COMPARABLES };
  }
  return null;
}

// Value lost per mile, as a continuous rate, fitted from the comparables when they span enough
// mileage and otherwise a conservative default. Either way it stays within a plausible band.
function mileageRate(comparables: Array<{ mileage: number; price: number }>) {
  if (comparables.length < MIN_FIT_COMPARABLES) return DEFAULT_MILEAGE_RATE;
  const miles = comparables.map((comparable) => comparable.mileage);
  const logs = comparables.map((comparable) => Math.log(comparable.price));
  const meanMiles = mean(miles);
  const meanLog = mean(logs);
  const variance = mean(miles.map((value) => (value - meanMiles) ** 2));
  if (Math.sqrt(variance) < MIN_FIT_MILEAGE_SPREAD) return DEFAULT_MILEAGE_RATE;
  const covariance = mean(miles.map((value, index) => (value - meanMiles) * (logs[index] - meanLog)));
  const fitted = -covariance / variance;
  return Math.min(MAX_MILEAGE_RATE, Math.max(MIN_MILEAGE_RATE, fitted));
}

function mean(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
