import Link from "next/link";
import { AutoHunterLockup } from "@/components/autohunter-brand";
import { requireUser } from "@/lib/auth";
import { listDigestReports } from "@/lib/dal";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await requireUser();
  const reports = await listDigestReports(user.id);

  return (
    <main className="report-shell">
      <header className="report-nav">
        <Link className="brand-lockup" href="/"><AutoHunterLockup /></Link>
        <Link className="report-back" href="/">Back to decision desk</Link>
      </header>
      <section className="report-intro">
        <p className="eyebrow">Your evidence archive</p>
        <h1>Daily reports</h1>
        <p>Every sent shortlist stays attached to your account. Historical lease benchmarks remain clearly separate from active offers.</p>
      </section>
      <section className="report-list" aria-label="Daily report history">
        {reports.length ? reports.map((report) => (
          <Link className="report-row" href={`/reports/${report.id}`} key={report.id}>
            <span>
              <strong>{formatReportDate(report.scheduledFor)}</strong>
              <small>{report.finishedAt ? `Finished ${formatReportTime(report.finishedAt)}` : "Run still in progress"}</small>
            </span>
            <span className={`report-status ${report.status}`}>{report.status}</span>
            <span className="report-count">{report.listingCount} candidate{report.listingCount === 1 ? "" : "s"}</span>
            <span aria-hidden="true">↗</span>
          </Link>
        )) : (
          <div className="report-empty">
            <h2>No reports yet</h2>
            <p>The first daily collection cycle will leave its evidence here, even when nothing clears your filters.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function formatReportDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatReportTime(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(date));
}
