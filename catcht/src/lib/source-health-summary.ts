interface SourceResult {
  status: string;
  finishedAt: string;
  messageCode: string | null;
  acceptedCount: number;
  discoveredCount: number;
  searchedCount: number;
}

export function isSourceHealthy(source: SourceResult, now = Date.now()) {
  const age = now - Date.parse(source.finishedAt);
  return ["success", "empty"].includes(source.status) && Number.isFinite(age) && age >= -300_000 && age <= 48 * 3_600_000;
}

export function sourceLabel(source: string) {
  if (source === "nhtsa") return "NHTSA";
  if (source === "auto_dev") return "Auto.dev";
  if (source === "marketcheck") return "MarketCheck";
  if (source === "marketcheck_incentives") return "OEM lease programs";
  if (source === "email_alert") return "Authorized email imports";
  if (!/[_-]/.test(source)) return source;
  return source.split(/[_-]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export function sourceStatusLabel(source: SourceResult, now = Date.now()) {
  if (["success", "empty"].includes(source.status) && !isSourceHealthy(source, now)) return "Stale · no recent collection result";
  const cap = source.messageCode?.match(/^radius_capped_(\d{1,3})mi$/);
  const budget = source.messageCode?.match(/^query_budget_capped_(\d+)of(\d+)$/);
  const models = source.messageCode?.match(/^model_query_capped_(\d+)of(\d+)$/);
  const coverage = cap ? ` · ${cap[1]}-mile coverage cap`
    : budget ? ` · ${budget[1]} of ${budget[2]} provider groups covered`
    : models ? ` · ${models[1]} of ${models[2]} model groups checked` : "";
  if (source.status === "success") return `${source.acceptedCount} accepted from ${source.discoveredCount}${coverage}`;
  if (source.status === "empty") return `No matches · ${source.searchedCount} searches${coverage}`;
  if (source.messageCode === "rate_limited") return "Provider quota reached";
  if (source.messageCode === "plan_upgrade_required") return "Plan upgrade required";
  if (["credential_unavailable", "credential_missing"].includes(source.messageCode ?? "")) return "Not connected";
  if (source.messageCode === "source_terms_prohibit_automation") return "Manual or email import only";
  if (source.status === "unavailable") return "Temporarily unavailable";
  if (source.status === "challenged") return "Source access challenged";
  return "Collection failed";
}
