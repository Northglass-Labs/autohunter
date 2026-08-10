type Environment = Record<string, string | undefined>;

function integer(
  env: Environment,
  name: string,
  fallback: number,
  { min, max }: { min: number; max: number },
) {
  const raw = env[name];
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function searchPolicyFromEnv(env: Environment) {
  const centerZip = env.SEARCH_ZIP?.trim() || "10001";
  if (!/^\d{5}$/.test(centerZip)) throw new Error("SEARCH_ZIP must be a five-digit US ZIP code");
  return {
    centerZip,
    maxDistanceMiles: integer(env, "SEARCH_RADIUS_MILES", 150, { min: 1, max: 500 }),
    maxMileage: integer(env, "SEARCH_MAX_MILEAGE", 120_000, { min: 0, max: 1_000_000 }),
    maxPrice: integer(env, "SEARCH_MAX_PRICE", 15_000, { min: 1, max: 1_000_000 }),
  } as const;
}

export const SEARCH_POLICY = searchPolicyFromEnv(process.env);
