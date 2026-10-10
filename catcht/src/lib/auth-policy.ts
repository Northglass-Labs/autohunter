import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email().max(320);

export function normalizeEmail(value: string) {
  return emailSchema.parse(value);
}

// Authentication methods that prove control of the invited inbox: a link or code sent to it.
const EMAIL_LINK_METHODS = new Set(["magiclink", "otp", "email/signup", "invite", "recovery", "email_change"]);
// Methods that prove nothing about the inbox. Sign-up auto-confirms, so a password sign-up for an
// invited address would otherwise claim that invitation (ADR-022).
const NON_EMAIL_METHODS = new Set(["password", "anonymous", "oauth", "sso/saml", "web3", "oauth_provider/authorization_code"]);

// True when a verified session's `amr` claim shows it was created by an email link or code and by
// nothing else. A second factor (`totp`, `mfa/*`) neither qualifies nor disqualifies a session.
export function isEmailLinkSession(amr: unknown) {
  if (!Array.isArray(amr)) return false;
  const methods = amr.map((entry) => typeof entry === "string"
    ? entry
    : entry && typeof entry === "object" && "method" in entry ? String(entry.method) : "");
  return methods.some((method) => EMAIL_LINK_METHODS.has(method))
    && !methods.some((method) => NON_EMAIL_METHODS.has(method) || method.startsWith("oauth"));
}

export function safeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const parsed = new URL(value, "https://autohunter.invalid");
    if (parsed.origin !== "https://autohunter.invalid") return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}
