import { currentUser } from "@/lib/auth";
import {
  getAllSavedSearches,
  getListings,
  getSavedSearches,
  getSourceHealth,
  listUserProfiles,
  type ListingCard,
} from "@/lib/dal";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "./actions";
import { ListingCard as ListingCardView } from "@/components/listing-card";
import { SavedSearchPanel } from "@/components/saved-search-panel";
import { SourceHealth } from "@/components/source-health";
import { TeamPanel } from "@/components/team-panel";
import { AutoHunterLockup } from "@/components/autohunter-brand";
import { INSTANCE_CONFIG } from "@/lib/instance-config";
import type { GarageGroup, OfferKind } from "@/lib/types";

export const dynamic = "force-dynamic";

type View = "finds" | "pending" | "interested" | "ignored";
type Sort = "score" | "fit" | "features" | "price" | "monthly" | "mileage" | "distance";
type Kind = "all" | OfferKind;
type Lane = "all" | GarageGroup;

const LANES: GarageGroup[] = ["ev", "gas", "lease", "enthusiast", "other"];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; sort?: string; kind?: string; lane?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const view: View = ["pending", "interested", "ignored"].includes(params.view ?? "") ? (params.view as View) : "finds";
  const sort: Sort = ["fit", "features", "price", "monthly", "mileage", "distance"].includes(params.sort ?? "") ? (params.sort as Sort) : "score";
  const kind: Kind = ["used", "new", "lease"].includes(params.kind ?? "") ? (params.kind as Kind) : "all";
  const lane: Lane = LANES.includes(params.lane as GarageGroup) ? (params.lane as Lane) : "all";
  const disposition = view === "finds" || view === "pending" ? "neutral" : view;
  const [rawListings, searches, sourceHealth, people, allSearches] = await Promise.all([
    getListings(
      user.id,
      disposition,
      view === "pending" ? "pending" : "verified",
      kind === "all" ? undefined : kind,
      lane === "all" ? undefined : lane,
    ),
    getSavedSearches(user.id),
    getSourceHealth(),
    user.role === "admin" ? listUserProfiles() : Promise.resolve([]),
    user.role === "admin" ? getAllSavedSearches() : Promise.resolve([]),
  ]);
  const listings = sortListings(rawListings, sort);
  const activeSearches = searches.filter((search) => search.active);
  const sourceCount = sourceHealth.filter((source) => source.status === "success" || source.status === "empty").length;
  const priceCeiling = activeSearches.reduce((maximum, search) => Math.max(maximum, search.maxPrice ?? 0), 0);
  const activeOfferCount = listings.filter((listing) => listing.offerRole === "active_offer").length;
  const benchmarkCount = listings.filter((listing) => listing.offerRole === "benchmark").length;
  return (
    <main className="app-shell">
      <header className="hero">
        <nav className="hero-nav" aria-label="AutoHunter account">
          <Link href="/" className="brand-lockup">
            <AutoHunterLockup />
          </Link>
          <div className="account-cluster">
            <Link href="/reports">Reports</Link>
            {user.role === "admin" ? <a href="#team">Household</a> : null}
            <span className="user-chip"><i aria-hidden="true">{user.displayName.charAt(0).toUpperCase()}</i>{user.displayName}</span>
            <form action={signOutAction}><button className="hero-signout" type="submit">Sign out</button></form>
          </div>
        </nav>
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">{INSTANCE_CONFIG.locationLabel} · private vehicle intelligence</p>
            <h1>Drive what you love.<br /><em>Bring everyone.</em></h1>
            <p>AutoHunter tracks the rare overlap of car-seat practicality, real highway-assist equipment, driving character, and favorable depreciation. Every claim stays attached to its source.</p>
            <div className="hero-actions">
              <a className="button hero-primary" href="#search-studio">Edit search briefs</a>
              <Link className="hero-report-link" href="/reports">Read daily reports <span aria-hidden="true">↗</span></Link>
              <span><strong>{activeSearches.length}</strong> searches · {priceCeiling ? `${compactMoney(priceCeiling)} hard ceiling` : "flexible budget"}</span>
            </div>
          </div>
          <aside className="hunt-radar" aria-label={`${listings.length} vehicles in the current queue`}>
            <div className="radar-face" aria-hidden="true"><span /><i /><strong>{listings.length}</strong><small>matches</small></div>
            <dl>
              <div><dt>EV</dt><dd>{listings.filter((listing) => listing.garageGroup === "ev").length}</dd></div>
              <div><dt>Gas</dt><dd>{listings.filter((listing) => listing.garageGroup === "gas").length}</dd></div>
              <div><dt>Lease</dt><dd>{listings.filter((listing) => listing.garageGroup === "lease").length}</dd></div>
            </dl>
          </aside>
        </div>
      </header>

      <section className="snapshot-strip" aria-label="Hunt snapshot">
        <article><span>Current queue</span><strong>{listings.length}</strong><small>{viewLabel(view)}</small></article>
        <article><span>Live offers</span><strong>{activeOfferCount}</strong><small>actionable now</small></article>
        <article><span>Benchmarks</span><strong>{benchmarkCount}</strong><small>signed comparison deals</small></article>
        <article><span>Healthy sources</span><strong>{sourceCount || "—"}</strong><small>{activeSearches.length} private search briefs</small></article>
      </section>

      <nav className="tabs" aria-label="Review queue">
        <Link className={view === "finds" ? "active" : ""} href={viewHref("finds", lane, kind)}>To review</Link>
        <Link className={view === "pending" ? "active" : ""} href={viewHref("pending", lane, kind)}>Photo pending</Link>
        <Link className={view === "interested" ? "active" : ""} href={viewHref("interested", lane, kind)}>Interested</Link>
        <Link className={view === "ignored" ? "active" : ""} href={viewHref("ignored", lane, kind)}>Passed</Link>
        <a className="tune-link" href="#search-studio">Tune targets <span aria-hidden="true">↘</span></a>
      </nav>

      <nav className="lane-filter" aria-label="Vehicle lanes">
        {(["all", ...LANES] as Lane[]).map((value) => (
          <Link key={value} className={lane === value ? "active" : ""} href={laneHref(view, value, kind)}>{laneLabel(value)}</Link>
        ))}
      </nav>

      <nav className="kind-filter" aria-label="Filter by offer type">
        {(["all", "used", "new", "lease"] as const).map((offerKind) => (
          <Link key={offerKind} className={kind === offerKind ? "active" : ""} href={kindHref(view, lane, offerKind)}>{offerKind}</Link>
        ))}
      </nav>

      <section className="toolbar">
        <p><strong>{view === "pending" ? "Manual claim found; gallery proof pending." : "Evidence first: confirmed, expected, and unknown equipment stay distinct."}</strong> Your Interested and Pass decisions are private, reversible, and remembered.</p>
        <form>
          <input type="hidden" name="view" value={view} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="lane" value={lane} />
          <label>Sort <select name="sort" defaultValue={sort}><option value="score">Best overall</option><option value="fit">Family fit</option><option value="features">Feature match</option><option value="price">Lowest price</option><option value="monthly">Lowest effective / month</option><option value="mileage">Lowest miles</option><option value="distance">Closest</option></select></label>
          <button type="submit" className="small-button">Apply</button>
        </form>
      </section>

      <ListingSections listings={listings} view={view} lane={lane} />

      <SourceHealth sources={sourceHealth} />
      <SavedSearchPanel searches={searches} />
      {user.role === "admin" ? <TeamPanel people={people} searches={allSearches} /> : null}
      <footer className="app-footer"><span>{INSTANCE_CONFIG.appName} <small>{INSTANCE_CONFIG.endorsement}</small></span><p>Used · lease · package evidence · source health · private decisions</p></footer>
    </main>
  );
}

function ListingSections({ listings, view, lane }: { listings: ListingCard[]; view: View; lane: Lane }) {
  if (listings.length === 0) {
    return <section className="listing-grid"><div className="empty"><div className="empty-gate" aria-hidden="true">H</div><h2>Nothing worthy in this lane</h2><p>The radar will not pad the queue with guesses or stale repeats.</p></div></section>;
  }
  const groups = lane === "all" ? LANES : [lane];
  return (
    <div className="listing-sections">
      {groups.map((group) => {
        const matching = listings.filter((listing) => listing.garageGroup === group);
        if (matching.length === 0) return null;
        return (
          <section className={`listing-lane ${group}`} key={group}>
            <header><div><p className="eyebrow">{laneEyebrow(group)}</p><h2>{laneLabel(group)}</h2></div><span>{matching.length} in queue</span></header>
            {group === "lease" ? <LeaseRoleSections listings={matching} view={view} /> : (
              <div className="listing-grid">{matching.map((listing) => <ListingCardView key={listing.id} listing={listing} view={view} />)}</div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function LeaseRoleSections({ listings, view }: { listings: ListingCard[]; view: View }) {
  const roles = [
    { key: "active_offer", title: "Active offers", note: "Current programs with enough disclosed economics to normalize" },
    { key: "benchmark", title: "Signed benchmarks", note: "Recent completed deals for negotiation context—not live inventory" },
    { key: "market_signal", title: "Market signals", note: "Relevant programs and updates still missing complete terms" },
  ] as const;
  return (
    <div className="lease-role-sections">
      {roles.map((role) => {
        const matching = listings.filter((listing) => listing.offerRole === role.key);
        if (!matching.length) return null;
        return (
          <section className={`lease-role-section ${role.key}`} key={role.key}>
            <div className="lease-role-heading"><div><h3>{role.title}</h3><p>{role.note}</p></div><span>{matching.length}</span></div>
            <div className="listing-grid">{matching.map((listing) => <ListingCardView key={listing.id} listing={listing} view={view} />)}</div>
          </section>
        );
      })}
    </div>
  );
}

function sortListings(listings: ListingCard[], sort: Sort) {
  return [...listings].sort((a, b) => {
    if (sort === "score") return b.dealScore - a.dealScore;
    if (sort === "fit") return b.familyFitScore - a.familyFitScore || b.dealScore - a.dealScore;
    if (sort === "features") return b.featureMatchScore - a.featureMatchScore || b.dealScore - a.dealScore;
    if (sort === "monthly") return nullableSort(a.effectiveMonthly, b.effectiveMonthly);
    if (sort === "price") return nullableSort(a.price, b.price);
    if (sort === "mileage") return nullableSort(a.mileage, b.mileage);
    return nullableSort(a.distanceMiles, b.distanceMiles);
  });
}

function nullableSort(a: number | null, b: number | null) {
  return (a ?? Number.POSITIVE_INFINITY) - (b ?? Number.POSITIVE_INFINITY);
}

function viewHref(view: View, lane: Lane, kind: Kind) {
  return `/?view=${view}${lane === "all" ? "" : `&lane=${lane}`}${kind === "all" ? "" : `&kind=${kind}`}`;
}

function laneHref(view: View, lane: Lane, kind: Kind) {
  return `/?view=${view}${lane === "all" ? "" : `&lane=${lane}`}${kind === "all" ? "" : `&kind=${kind}`}`;
}

function kindHref(view: View, lane: Lane, kind: Kind) {
  return `/?view=${view}${lane === "all" ? "" : `&lane=${lane}`}${kind === "all" ? "" : `&kind=${kind}`}`;
}

function laneLabel(lane: Lane) {
  if (lane === "all") return "All lanes";
  if (lane === "ev") return "EVs";
  if (lane === "gas") return "Gas + hybrid";
  if (lane === "lease") return "Lease deals";
  if (lane === "enthusiast") return "Enthusiast";
  return "Other";
}

function laneEyebrow(lane: GarageGroup) {
  if (lane === "ev") return "Depreciated electric family cars";
  if (lane === "gas") return "Driver-focused family haulers";
  if (lane === "lease") return "Authorized alerts and dealer offers";
  if (lane === "enthusiast") return "Preserved manual-car watchlist";
  return "Additional matches";
}

function viewLabel(view: View) {
  if (view === "pending") return "needs photo proof";
  if (view === "interested") return "on your shortlist";
  if (view === "ignored") return "passed for now";
  return "ready for review";
}

function compactMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: value >= 100_000 ? "compact" : "standard",
  }).format(value);
}
