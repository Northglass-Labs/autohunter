import type { ListingCard } from "./dal";

export function isW222Candidate(listing: Pick<ListingCard, "make" | "model" | "trim" | "year" | "bodyStyle">) {
  return /^mercedes[ -]benz$/i.test(listing.make) && /^s[ -]class$/i.test(listing.model)
    && /\bs\s?(450|560)\b/i.test(listing.trim ?? "") && !/\bs\s?560\s?e\b/i.test(listing.trim ?? "")
    && listing.year !== null && listing.year >= 2018 && listing.year <= 2020 && /\b(sedan|saloon)\b/i.test(listing.bodyStyle ?? "");
}

export function buyingChecksFor(listing: ListingCard) {
  if (!isW222Candidate(listing)) return [];
  return [
    "Arrange an independent inspection with a Mercedes specialist: cold start, fluid leaks, brakes, tires, service history and a full-module diagnostic scan.",
    "Check suspension height after an overnight park and test every seat, camera, driver-assistance and phone-integration function.",
    "Confirm optional packages on the VIN build sheet or window sticker. Asking price excludes tax, fees and a repair reserve.",
  ];
}
