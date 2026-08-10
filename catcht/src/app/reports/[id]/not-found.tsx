import Link from "next/link";

export default function ReportNotFound() {
  return (
    <main className="center-shell">
      <section className="confirm-card locked-card">
        <p className="eyebrow">Private report</p>
        <h1>Report not found</h1>
        <p>This report does not exist or belongs to another AutoHunter account.</p>
        <Link className="button primary" href="/reports">Back to your reports</Link>
      </section>
    </main>
  );
}
