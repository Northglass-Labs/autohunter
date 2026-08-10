import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");

describe("hosted authentication configuration", () => {
  it("uses the canonical AutoHunter origin and invite-only database hook", () => {
    expect(config).toContain('site_url = "https://autohunter.northglass.io"');
    expect(config).toContain('uri = "pg-functions://postgres/catcht/authorize_invited_user"');
    expect(config).toContain('enable_anonymous_sign_ins = false');
  });

  it("sends branded auth mail through Resend without committing a credential", () => {
    expect(config).toContain("[auth.email.smtp]");
    expect(config).toContain('host = "smtp.resend.com"');
    expect(config).toContain('user = "resend"');
    expect(config).toContain('pass = "env(RESEND_API_KEY)"');
    expect(config).toContain('admin_email = "carhunt@northglass.io"');
    expect(config).not.toMatch(/re_[A-Za-z0-9]{16,}/);
  });
});
