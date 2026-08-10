type Environment = Record<string, string | undefined>;

function label(value: string | undefined, fallback: string, name: string) {
  const result = value?.trim() || fallback;
  if (result.length > 80 || /[\u0000-\u001f\u007f]/.test(result)) {
    throw new Error(`${name} must be a short printable label`);
  }
  return result;
}

export function instanceConfigFromEnv(env: Environment) {
  return {
    appName: label(env.APP_NAME, "AutoHunter", "APP_NAME"),
    recipientName: label(env.RECIPIENT_NAME, "your household", "RECIPIENT_NAME"),
    locationLabel: label(env.SEARCH_LOCATION_LABEL, "your search center", "SEARCH_LOCATION_LABEL"),
    endorsement: "a Northglass Product",
  } as const;
}

export const INSTANCE_CONFIG = instanceConfigFromEnv(process.env);
