type DatabaseSslOptions = {
  rejectUnauthorized: true;
  ca?: string;
};

export function databaseSslOptions(
  caValue?: string,
  mode: "verify-full" | "disable" = "verify-full",
): DatabaseSslOptions | false {
  if (mode === "disable") return false;
  const ca = caValue?.replaceAll("\\n", "\n").trim();
  if (!ca) return { rejectUnauthorized: true };

  if (!ca.startsWith("-----BEGIN CERTIFICATE-----") || !ca.endsWith("-----END CERTIFICATE-----")) {
    throw new Error("DATABASE_CA_CERT must contain a PEM certificate");
  }

  return { rejectUnauthorized: true, ca: `${ca}\n` };
}
