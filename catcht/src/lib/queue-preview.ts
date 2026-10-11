export const LANE_PREVIEW = 12;

// The all-lanes overview shows each lane's best cards and links to the rest, so the default page
// no longer renders every match at once. A selected lane shows everything.
export function lanePreview<T>(listings: readonly T[], laneSelected: boolean, limit = LANE_PREVIEW) {
  const shown = laneSelected ? [...listings] : listings.slice(0, limit);
  return { shown, hidden: listings.length - shown.length };
}
