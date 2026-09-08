// Keep these boundary rules aligned with catcht/src/lib/vehicle-filters.ts.
function normalized(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function matchesBodyStyle(actual, requested) {
  if (!requested) return true;
  const body = normalized(actual).replace(/\bsaloon\b/g, "sedan").replace(/\bcabriolet\b/g, "convertible");
  return ` ${body} `.includes(` ${requested} `);
}

export function matchesTrim(actual, requested, aliases = []) {
  if (!requested) return true;
  const trimText = (value) => normalized(value).replace(/\bs\s+(\d{3})\b/g, "s$1").replace(/\b(s\d{3})\s+e\b/g, "$1e");
  const value = ` ${trimText(actual)} `;
  return [requested, ...aliases].some((alias) => trimText(alias) && value.includes(` ${trimText(alias)} `));
}
