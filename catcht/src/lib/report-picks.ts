export const REPORT_PICKS = 12;
export const PICKS_PER_SEARCH = 3;

// The report's picks from candidates already ranked best first: at most three from any one saved
// search while other searches still have candidates, then the next best overall. One busy search
// can no longer fill a report. The picks keep their rank order.
export function pickReportCandidates<T>(
  ranked: readonly T[],
  searchOf: (candidate: T) => string,
  limit = REPORT_PICKS,
  perSearch = PICKS_PER_SEARCH,
): T[] {
  const chosen = new Set<number>();
  const perSearchCount = new Map<string, number>();
  ranked.forEach((candidate, index) => {
    if (chosen.size >= limit) return;
    const search = searchOf(candidate);
    const count = perSearchCount.get(search) ?? 0;
    if (count >= perSearch) return;
    chosen.add(index);
    perSearchCount.set(search, count + 1);
  });
  ranked.forEach((_, index) => {
    if (chosen.size < limit) chosen.add(index);
  });
  return [...chosen].sort((left, right) => left - right).map((index) => ranked[index]);
}
