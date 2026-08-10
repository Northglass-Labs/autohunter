function firstForwardedAddress(forwardedFor: string) {
  return forwardedFor.split(",", 1)[0]?.trim().replace(/^::ffff:/, "") ?? "";
}

export function isAllowedIp(forwardedFor: string | null, allowlist: string | undefined) {
  if (!forwardedFor || !allowlist) return false;
  const address = firstForwardedAddress(forwardedFor);
  if (!address) return false;
  return allowlist
    .split(",")
    .map((entry) => entry.trim().replace(/^::ffff:/, ""))
    .filter(Boolean)
    .includes(address);
}
