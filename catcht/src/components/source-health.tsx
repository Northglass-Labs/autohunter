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

  const healthy = sources.filter((source) => source.status === "success" || source.status === "empty").length;
  return (
    <section className="source-health">
      <div className="source-health-heading">
        <div><p className="eyebrow">Source network</p><h2>{healthy} of {sources.length} sources healthy</h2></div>
        <p>Every adapter reports its own last result, so an empty market never looks like a working scraper.</p>
      </div>
      <div className="source-health-grid">
        {sources.map((source) => (
          <article key={source.source} className={`source-status ${source.status}`}>
            <span className="status-light" aria-hidden="true" />
            <div>
              <strong>{sourceLabel(source.source)}</strong>
              <small>{statusLabel(source)}</small>
            </div>
            <time dateTime={source.finishedAt}>{shortAge(source.finishedAt)}</time>
          </article>
        ))}
      </div>
    </section>
  );
}

function sourceLabel(source: string) {
  if (source.toLowerCase() === "nhtsa") return "NHTSA";
  return source.split(/[_-]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function statusLabel(source: SourceHealthRecord) {
  const coverage = coverageCapLabel(source.messageCode);
  if (source.status === "success") return `${source.acceptedCount} accepted from ${source.discoveredCount}${coverage}`;
  if (source.status === "empty") return `Healthy · ${source.searchedCount} searches · no matches${coverage}`;
  if (source.status === "unavailable") {
    if (source.messageCode === "credential_unavailable" || source.messageCode === "credential_missing") return "Not connected";
    if (source.messageCode === "source_terms_prohibit_automation") return "Manual or email import only";
    return "Temporarily unavailable";
  }
  if (source.status === "challenged") return "Source access challenged";
  return "Collection failed safely";
}

function coverageCapLabel(messageCode: string | null) {
  const match = messageCode?.match(/^radius_capped_(\d{1,3})mi$/);
  if (match) return ` · ${match[1]}-mile coverage cap`;
  const budget = messageCode?.match(/^query_budget_capped_(\d+)of(\d+)$/);
  if (budget) return ` · ${budget[1]} of ${budget[2]} provider groups covered`;
  const models = messageCode?.match(/^model_query_capped_(\d+)of(\d+)$/);
  return models ? ` · ${models[1]} of ${models[2]} model groups checked` : "";
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
