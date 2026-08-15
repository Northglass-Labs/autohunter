import { currentUser } from "@/lib/auth";
import {
  getAllSavedSearches,
  getListings,
  getSavedSearches,
  getSourceHealth,
  listUserProfiles,
  type ListingCard,
  type SavedSearch,
  type SourceHealth as SourceHealthRecord,
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
type Sort = "score" | "fit" | "features" | "price" | "monthly" | "mileage" | "distance" | "newest";
type Kind = "all" | OfferKind;
type Lane = "all" | GarageGroup;

const LANES: GarageGroup[] = ["ev", "gas", "lease", "enthusiast", "other"];
const SORTS: Array<{ value: Sort; label: string }> = [
  { value: "score", label: "Best" },
  { value: "price", label: "Price" },
  { value: "monthly", label: "$ / mo" },
  { value: "mileage", label: "Miles" },
  { value: "distance", label: "Closest" },
  { value: "newest", label: "Newest" },
  { value: "features", label: "Features" },
  { value: "fit", label: "Family fit" },
];

interface Filters {
  view: View;
  sort: Sort;
  kind: Kind;
  lane: Lane;
  model: string;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; sort?: string; kind?: string; lane?: string; model?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const filters: Filters = {
    view: ["pending", "interested", "ignored"].includes(params.view ?? "") ? (params.view as View) : "finds",
    sort: SORTS.some((sort) => sort.value === params.sort) ? (params.sort as Sort) : "score",
    kind: ["used", "new", "lease"].includes(params.kind ?? "") ? (params.kind as Kind) : "all",
    lane: LANES.includes(params.lane as GarageGroup) ? (params.lane as Lane) : "all",
    model: (params.model ?? "").slice(0, 60),
  };
  const disposition = filters.view === "finds" || filters.view === "pending" ? "neutral" : filters.view;
  const [rawListings, searches, sourceHealth, people, allSearches] = await Promise.all([
    getListings(
      user.id,
      disposition,
      filters.view === "pending" ? "pending" : "verified",
      filters.kind === "all" ? undefined : filters.kind,
      filters.lane === "all" ? undefined : filters.lane,
    ),
    getSavedSearches(user.id),
    getSourceHealth(),
    user.role === "admin" ? listUserProfiles() : Promise.resolve([]),
    user.role === "admin" ? getAllSavedSearches() : Promise.resolve([]),
  ]);
  const activeSearches = searches.filter((search) => search.active);
  const models = modelChips(activeSearches);
  const activeModel = models.find((model) => model.slug === filters.model);
  if (filters.model && !activeModel) filters.model = "";
  const listings = sortListings(
    activeModel ? rawListings.filter((listing) => matchesModel(listing, activeModel)) : rawListings,
    filters.sort,
  );
  const sourceCount = sourceHealth.filter((source) => source.status === "success" || source.status === "empty").length;
  const activeOfferCount = listings.filter((listing) => listing.offerRole === "active_offer").length;
  const benchmarkCount = listings.filter((listing) => listing.offerRole === "benchmark").length;
  return (
    <main className="app-shell">
      <header className="topbar">
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
        <div className="topbar-title">
          <h1>Your deals</h1>
          <p>
            <strong>{listings.length}</strong> {viewLabel(filters.view)} across {activeSearches.length} saved search{activeSearches.length === 1 ? "" : "es"}.
            {" "}<a href="#search-studio">Edit searches</a> · <Link href="/reports">Daily reports</Link>
          </p>
        </div>
      </header>

      <section className="snapshot-strip" aria-label="Hunt snapshot">
        <article><span>Current queue</span><strong>{listings.length}</strong><small>{viewLabel(filters.view)}</small></article>
        <article><span>Live offers</span><strong>{activeOfferCount}</strong><small>actionable now</small></article>
        <article><span>Benchmarks</span><strong>{benchmarkCount}</strong><small>signed comparison deals</small></article>
        <article><span>Healthy sources</span><strong>{sourceCount || "—"}</strong><small>{activeSearches.length} private search briefs</small></article>
      </section>

      <div className="control-deck">
        <nav className="tabs" aria-label="Review queue">
          <Link className={filters.view === "finds" ? "active" : ""} href={href({ ...filters, view: "finds" })}>To review</Link>
          <Link className={filters.view === "pending" ? "active" : ""} href={href({ ...filters, view: "pending" })}>Photo pending</Link>
          <Link className={filters.view === "interested" ? "active" : ""} href={href({ ...filters, view: "interested" })}>Interested</Link>
          <Link className={filters.view === "ignored" ? "active" : ""} href={href({ ...filters, view: "ignored" })}>Passed</Link>
        </nav>
        <nav className="lane-filter" aria-label="Vehicle lanes">
          {(["all", ...LANES] as Lane[]).map((value) => (
            <Link key={value} className={filters.lane === value ? "active" : ""} href={href({ ...filters, lane: value })}>{laneLabel(value)}</Link>
          ))}
          <span className="chip-divider" aria-hidden="true" />
          {(["all", "used", "new", "lease"] as const).map((offerKind) => (
            <Link key={offerKind} className={`kind-chip ${filters.kind === offerKind ? "active" : ""}`} href={href({ ...filters, kind: offerKind })}>{offerKind === "all" ? "any kind" : offerKind}</Link>
          ))}
        </nav>
        {models.length > 1 ? (
          <nav className="model-filter" aria-label="Your models">
            <Link className={filters.model === "" ? "active" : ""} href={href({ ...filters, model: "" })}>All models</Link>
            {models.map((model) => (
              <Link key={model.slug} className={filters.model === model.slug ? "active" : ""} href={href({ ...filters, model: model.slug })}>{model.label}</Link>
            ))}
          </nav>
        ) : null}
        <nav className="sort-filter" aria-label="Sort order">
          <span className="sort-label">Sort</span>
          {SORTS.map((sort) => (
            <Link key={sort.value} className={filters.sort === sort.value ? "active" : ""} href={href({ ...filters, sort: sort.value })}>{sort.label}</Link>
          ))}
        </nav>
      </div>

      <ListingSections listings={listings} view={filters.view} lane={filters.lane} sourceHealth={sourceHealth} />

      <SourceHealth sources={sourceHealth} />
      <SavedSearchPanel searches={searches} />
      {user.role === "admin" ? <TeamPanel people={people} searches={allSearches} /> : null}
      <footer className="app-footer"><span>{INSTANCE_CONFIG.appName} <small>{INSTANCE_CONFIG.endorsement}</small></span><p>Used · lease · package evidence · source health · private decisions</p></footer>
    </main>
  );
}

function ListingSections({ listings, view, lane, sourceHealth }: { listings: ListingCard[]; view: View; lane: Lane; sourceHealth: SourceHealthRecord[] }) {
  if (listings.length === 0) {
    return (
      <section className="listing-grid">
        <div className="empty">
          <div className="empty-gate" aria-hidden="true">H</div>
          <h2>Nothing in this view</h2>
          <p>The radar will not pad the queue with guesses or stale repeats. Try All lanes, a different model, or check back after the next daily collection.</p>
        </div>
      </section>
    );
  }
  const groups = lane === "all" ? LANES : [lane];
  return (
    <div className="listing-sections">
      {groups.map((group) => {
        const matching = listings.filter((listing) => listing.garageGroup === group);
        if (matching.length === 0) {
          if (group === "lease" && lane === "lease") return <LeaseInputsNote key={group} sourceHealth={sourceHealth} />;
          return null;
        }
        return (
          <section className={`listing-lane ${group}`} key={group}>
            <header><div><p className="eyebrow">{laneEyebrow(group)}</p><h2>{laneLabel(group)}</h2></div><span>{matching.length} in queue</span></header>
            {group === "lease" ? <LeaseRoleSections listings={matching} view={view} sourceHealth={sourceHealth} /> : (
              <div className="listing-grid">{matching.map((listing) => <ListingCardView key={listing.id} listing={listing} view={view} />)}</div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function LeaseRoleSections({ listings, view, sourceHealth }: { listings: ListingCard[]; view: View; sourceHealth: SourceHealthRecord[] }) {
  const roles = [
    { key: "active_offer", title: "Active offers", note: "Current programs with enough disclosed economics to normalize" },
    { key: "benchmark", title: "Signed benchmarks", note: "Recent completed deals for negotiation context—not live inventory" },
    { key: "market_signal", title: "Market signals", note: "Relevant programs and updates still missing complete terms" },
  ] as const;
  const hasActiveOffers = listings.some((listing) => listing.offerRole === "active_offer");
  return (
    <div className="lease-role-sections">
      {!hasActiveOffers ? <LeaseInputsNote sourceHealth={sourceHealth} /> : null}
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

// Lease intelligence only arrives from authorized notifications, manual imports, and the OEM
// incentive feed. When there are no active offers, say why instead of showing a silent gap.
function LeaseInputsNote({ sourceHealth }: { sourceHealth: SourceHealthRecord[] }) {
  const importer = sourceHealth.find((source) => source.source === "email_alert");
  const incentives = sourceHealth.find((source) => source.source === "marketcheck_incentives");
  const importerLine = !importer
    ? "The authorized lease-alert importer has not run yet."
    : importer.status === "success" || importer.status === "empty"
      ? `The authorized lease-alert importer last ran ${dayLabel(importer.finishedAt)} and found ${importer.acceptedCount} new item${importer.acceptedCount === 1 ? "" : "s"}.`
      : `The authorized lease-alert importer is currently ${importer.status} (last attempt ${dayLabel(importer.finishedAt)}).`;
  const incentiveLine = incentives && (incentives.status === "success" || incentives.status === "empty")
    ? ` The licensed OEM incentive feed is healthy and currently reports ${incentives.discoveredCount === 0 ? "no published lease programs for your models" : `${incentives.discoveredCount} programs`}.`
    : "";
  return (
    <div className="lease-inputs-note">
      <strong>No active lease offers right now.</strong>
      <p>{importerLine}{incentiveLine} New authorized alerts and imports land here automatically; signed benchmarks below stay available for negotiation context.</p>
    </div>
  );
}

function modelChips(searches: SavedSearch[]) {
  const chips = new Map<string, { slug: string; label: string; make: string; model: string; aliases: string[] }>();
  for (const search of searches) {
    const slug = `${normalized(search.make)}-${normalized(search.model)}`.replace(/\s+/g, "-");
    const existing = chips.get(slug);
    if (existing) {
      existing.aliases = [...new Set([...existing.aliases, ...(search.aliases ?? [])])];
      continue;
    }
    chips.set(slug, {
      slug,
      label: `${search.make} ${search.model}`,
      make: search.make,
      model: search.model,
      aliases: search.aliases ?? [],
    });
  }
  return [...chips.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function matchesModel(listing: ListingCard, chip: { make: string; model: string; aliases: string[] }) {
  if (normalized(listing.make) !== normalized(chip.make)) return false;
  const model = normalized(listing.model);
  return [chip.model, ...chip.aliases].some((candidate) => {
    const wanted = normalized(candidate);
    return wanted && (model === wanted || model.includes(wanted) || wanted.includes(model));
  });
}

function normalized(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sortListings(listings: ListingCard[], sort: Sort) {
  return [...listings].sort((a, b) => {
    if (sort === "score") return b.dealScore - a.dealScore;
    if (sort === "fit") return b.familyFitScore - a.familyFitScore || b.dealScore - a.dealScore;
    if (sort === "features") return b.featureMatchScore - a.featureMatchScore || b.dealScore - a.dealScore;
    if (sort === "monthly") return nullableSort(a.effectiveMonthly, b.effectiveMonthly);
    if (sort === "price") return nullableSort(a.price, b.price);
    if (sort === "mileage") return nullableSort(a.mileage, b.mileage);
    if (sort === "newest") return nullableSort(a.daysOnMarket, b.daysOnMarket);
    return nullableSort(a.distanceMiles, b.distanceMiles);
  });
}

function nullableSort(a: number | null, b: number | null) {
  return (a ?? Number.POSITIVE_INFINITY) - (b ?? Number.POSITIVE_INFINITY);
}

function href(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.view !== "finds") params.set("view", filters.view);
  if (filters.lane !== "all") params.set("lane", filters.lane);
  if (filters.kind !== "all") params.set("kind", filters.kind);
  if (filters.model) params.set("model", filters.model);
  if (filters.sort !== "score") params.set("sort", filters.sort);
  const query = params.toString();
  return query ? `/?${query}` : "/";
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

function dayLabel(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
