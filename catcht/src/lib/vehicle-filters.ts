// Keep these boundary rules aligned with collector/src/vehicle-filters.mjs.
function normalized(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function matchesBodyStyle(actual: string | null | undefined, requested: string | null | undefined) {
  if (!requested) return true;
  const body = normalized(actual).replace(/\bsaloon\b/g, "sedan").replace(/\bcabriolet\b/g, "convertible");
  return ` ${body} `.includes(` ${requested} `);
}

export function matchesTrim(actual: string | null | undefined, requested: string | null | undefined, aliases: string[] = []) {
  if (!requested) return true;
  const trimText = (value: string | null | undefined) => normalized(value).replace(/\bs\s+(\d{3})\b/g, "s$1").replace(/\b(s\d{3})\s+e\b/g, "$1e");
  const value = ` ${trimText(actual)} `;
  return [requested, ...aliases].some((alias) => trimText(alias) && value.includes(` ${trimText(alias)} `));
}
