import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");

describe("local authentication configuration", () => {
  it("keeps local magic links on the E2E origin and retains the invite-only database hook", () => {
    expect(config).toContain('site_url = "http://127.0.0.1:3100"');
    expect(config).toContain('uri = "pg-functions://postgres/catcht/authorize_invited_user"');
    expect(config).toContain('enable_anonymous_sign_ins = false');
  });

  it("captures auth mail in local Mailpit instead of contacting production SMTP", () => {
    expect(config).toContain("[auth.email.smtp]");
    expect(config).toContain("enabled = false");
    expect(config).not.toContain('host = "smtp.resend.com"');
    expect(config).not.toContain("RESEND_API_KEY");
    expect(config).not.toMatch(/re_[A-Za-z0-9]{16,}/);
  });
});
