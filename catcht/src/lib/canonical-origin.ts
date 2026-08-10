const LEGACY_PRODUCT_HOSTS = new Set([
  "mookmobile.tomstetson.dev",
  "mookmobile.vercel.app",
]);

export function canonicalRedirectUrl(currentUrl: string, appOrigin: string | undefined) {
  if (!appOrigin) return null;

  try {
    const current = new URL(currentUrl);
    const canonical = new URL(appOrigin);
    if (canonical.protocol !== "https:" || canonical.username || canonical.password) return null;
    if (!LEGACY_PRODUCT_HOSTS.has(current.hostname.toLowerCase())) return null;

    canonical.pathname = current.pathname;
    canonical.search = current.search;
    canonical.hash = "";
    return canonical;
  } catch {
    return null;
  }
}
