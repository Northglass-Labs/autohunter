import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoHunterLockup } from "@/components/autohunter-brand";
import { ListingCard } from "@/components/listing-card";
import { requireUser } from "@/lib/auth";
import { getDigestReport, type DigestReportDetail, type ListingCard as Listing } from "@/lib/dal";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const report = await getDigestReport(user.id, id);
  if (!report) notFound();

  const purchases = report.listings.filter((listing) => listing.offerKind !== "lease");
  const activeLeases = report.listings.filter((listing) => listing.offerKind === "lease" && listing.offerRole === "active_offer");
  const benchmarks = report.listings.filter((listing) => listing.offerKind === "lease" && listing.offerRole === "benchmark");
  const signals = report.listings.filter((listing) => listing.offerKind === "lease" && listing.offerRole === "market_signal");

  return (
    <main className="report-shell report-detail-shell">
      <header className="report-nav">
        <Link className="brand-lockup" href="/"><AutoHunterLockup /></Link>
        <Link className="report-back" href="/reports">All reports</Link>
      </header>
      <section className="report-hero">
        <p className="eyebrow">Daily decision report</p>
        <h1>{formatReportDate(report.scheduledFor)}</h1>
        <p>{bottomLine(report, purchases.length, activeLeases.length, benchmarks.length, signals.length)}</p>
        <dl>
          <div><dt>Status</dt><dd>{report.status}</dd></div>
          <div><dt>Candidates</dt><dd>{report.listingCount}</dd></div>
          <div><dt>Source issues</dt><dd>{report.sourceHealth.filter((source) => !["success", "empty"].includes(source.status)).length}</dd></div>
        </dl>
      </section>

      <div className="report-sections">
        <ReportListingSection title="Fresh & changed vehicle finds" note="Used and new listings captured at send time" listings={purchases} />
        <ReportListingSection title="Active lease offers" note="Current programs with complete enough terms to normalize" listings={activeLeases} />
        <ReportListingSection title="Signed benchmarks" note="Negotiation context—not live inventory" listings={benchmarks} />
        <ReportListingSection title="Market signals" note="Research leads with incomplete economics" listings={signals} />
      </div>
      <ReportSourceHealth report={report} />
      <footer className="app-footer"><span>AutoHunter <small>a Northglass Product</small></span><p>Historical price and effective-monthly values are shown as sent.</p></footer>
    </main>
  );
}

function ReportListingSection({ title, note, listings }: { title: string; note: string; listings: Listing[] }) {
  if (!listings.length) return null;
  return (
    <section className="report-listing-section">
      <header><div><h2>{title}</h2><p>{note}</p></div><span>{listings.length}</span></header>
      <div className="listing-grid">{listings.map((listing) => <ListingCard key={listing.id} listing={listing} view="finds" />)}</div>
    </section>
  );
}

function ReportSourceHealth({ report }: { report: DigestReportDetail }) {
  if (!report.sourceHealth.length) {
    return <section className="report-source-health"><h2>Source health</h2><p>No source-health snapshot was stored for this historical run.</p></section>;
  }
  return (
    <section className="report-source-health">
      <header><h2>Source health</h2><p>Provider state captured with this report.</p></header>
      <div>
        {report.sourceHealth.map((source) => (
          <article key={`${source.adapter}:${source.source}`}>
            <span className={`health-dot ${source.status}`} aria-hidden="true" />
            <span><strong>{source.source}</strong><small>{source.messageCode ? source.messageCode.replaceAll("_", " ") : `${source.acceptedCount} accepted`}</small></span>
            <b>{source.status}</b>
          </article>
        ))}
      </div>
    </section>
  );
}

function bottomLine(report: DigestReportDetail, purchaseCount: number, activeLeaseCount: number, benchmarkCount: number, signalCount: number) {
  if (!report.listingCount) return "No new or meaningfully changed candidate cleared your filters on this run.";
  return `${purchaseCount} purchase candidate${purchaseCount === 1 ? "" : "s"} and ${activeLeaseCount} live lease offer${activeLeaseCount === 1 ? "" : "s"} cleared your filters. ${benchmarkCount} benchmark${benchmarkCount === 1 ? "" : "s"} and ${signalCount} market signal${signalCount === 1 ? "" : "s"} are context only.`;
}

function formatReportDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}
