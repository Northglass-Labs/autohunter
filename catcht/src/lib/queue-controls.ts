import type { OfferKind } from "./types";

export interface QueuePriceCaps {
  maxPrice: number | null;
  maxMonthly: number | null;
}

interface QueuePriceCandidate {
  offerKind: OfferKind;
  price: number | null;
  effectiveMonthly: number | null;
  monthlyPayment: number | null;
}

type SwipeView = "finds" | "pending" | "interested" | "ignored";
type SwipeDisposition = "interested" | "ignored";

const MAX_MONEY_CAP = 10_000_000;

export function parseMoneyCap(value: string | string[] | undefined): number | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^[0-9]{1,8}$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) && amount >= 1 && amount <= MAX_MONEY_CAP ? amount : null;
}

export function matchesQueuePriceCaps(
  listing: QueuePriceCandidate,
  caps: QueuePriceCaps,
): boolean {
  if (listing.offerKind === "lease") {
    if (caps.maxMonthly === null) return true;
    const monthly = listing.effectiveMonthly ?? listing.monthlyPayment;
    return monthly !== null && monthly <= caps.maxMonthly;
  }
  if (caps.maxPrice === null) return true;
  return listing.price !== null && listing.price <= caps.maxPrice;
}

export function swipeDecision({
  view,
  deltaX,
  deltaY,
  cardWidth,
}: {
  view: SwipeView;
  deltaX: number;
  deltaY: number;
  cardWidth: number;
}): SwipeDisposition | null {
  if (view !== "finds" && view !== "pending") return null;
  const horizontal = Math.abs(deltaX);
  const vertical = Math.abs(deltaY);
  const threshold = Math.max(72, Math.min(110, cardWidth * 0.22));
  if (horizontal < threshold || horizontal <= vertical * 1.25) return null;
  return deltaX > 0 ? "interested" : "ignored";
}
