import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email().max(320);

export function normalizeEmail(value: string) {
  return emailSchema.parse(value);
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
