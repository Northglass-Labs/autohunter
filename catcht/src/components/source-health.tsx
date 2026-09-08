import { isSourceHealthy, sourceLabel, sourceStatusLabel } from "@/lib/source-health-summary";
import type { SourceHealth as SourceHealthRecord } from "@/lib/dal";

interface SourceHealthProps {
  sources: SourceHealthRecord[];
}

export function SourceHealth({ sources }: SourceHealthProps) {
  if (sources.length === 0) {
    return (
      <section className="source-health empty-health">
        <div><p className="eyebrow">Source network</p><h2>Ready for the first collection run</h2></div>
        <p>Connect an authorized inventory feed or import user-authorized deal alerts to start filling the radar.</p>
      </section>
    );
  }

  const healthy = sources.filter((source) => isSourceHealthy(source)).length;
  return (
    <section className="source-health">
      <div className="source-health-heading">
        <div><p className="eyebrow">Source network</p><h2>{healthy} of {sources.length} sources healthy</h2></div>
        <p>Recent results establish coverage. Older results stay visible and are marked stale after 48 hours.</p>
      </div>
      <div className="source-health-grid">
        {sources.map((source) => (
          <article key={source.source} className={`source-status ${isSourceHealthy(source) ? source.status : "failed"}`}>
            <span className="status-light" aria-hidden="true" />
            <div>
              <strong>{sourceLabel(source.source)}</strong>
              <small>{sourceStatusLabel(source)}</small>
            </div>
            <time dateTime={source.finishedAt}>{shortAge(source.finishedAt)}</time>
          </article>
        ))}
      </div>
    </section>
  );
}

function shortAge(timestamp: string) {
  const elapsed = Math.max(0, Date.now() - new Date(timestamp).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
