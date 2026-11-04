import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");
const operatorDocs = [
  "../docs/adr/026-preprovision-and-bind-invitation-identities.md",
  "../docs/standalone.md",
  "../docs/deployment-checklist.md",
].map((path) => [path, readFileSync(resolve(process.cwd(), path), "utf8")] as const);

describe("local authentication configuration", () => {
  it("keeps local magic links on the E2E origin and retains the invite-only database hook", () => {
    expect(config).toContain('site_url = "http://127.0.0.1:3100"');
    expect(config).toContain('uri = "pg-functions://postgres/catcht/authorize_invited_user"');
    expect(config).toContain('enable_anonymous_sign_ins = false');
  });

  it("disables account creation while keeping existing-user email sign-in enabled", () => {
    const auth = config.match(/\[auth\]([\s\S]*?)\[auth\.rate_limit\]/)?.[1];
    const email = config.match(/\[auth\.email\]([\s\S]*?)\[auth\.email\.smtp\]/)?.[1];

    expect(auth).toContain("enable_signup = false");
    expect(email).toContain("enable_signup = true");
  });

  it("keeps every invite-only Auth runbook aligned with the provider split", () => {
    for (const [path, document] of operatorDocs) {
      const normalized = document.replace(/\s+/g, " ");

      expect(normalized, path).not.toMatch(/disable both global and email/i);
      expect(normalized, path).toMatch(/global public user creation (?:is disabled|disabled)/i);
      expect(normalized, path).toMatch(/email provider (?:remains|must remain) enabled/i);
      expect(normalized, path).toContain("shouldCreateUser: false");
    }
  });

  it("captures auth mail in local Mailpit instead of contacting production SMTP", () => {
    expect(config).toContain("[auth.email.smtp]");
    expect(config).toContain("enabled = false");
    expect(config).not.toContain('host = "smtp.resend.com"');
    expect(config).not.toContain("RESEND_API_KEY");
    expect(config).not.toMatch(/re_[A-Za-z0-9]{16,}/);
  });
});
