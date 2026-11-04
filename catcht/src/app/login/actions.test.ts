import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCoreEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requestMagicLinkAction } from "./actions";

vi.mock("@/lib/env", () => ({ getCoreEnv: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

const signInWithOtp = vi.fn();

function request(email: string) {
  const formData = new FormData();
  formData.set("email", email);
  return requestMagicLinkAction({ sent: false, message: null }, formData);
}

describe("requestMagicLinkAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCoreEnv).mockReturnValue({ APP_URL: "https://autohunter.example.test" } as ReturnType<typeof getCoreEnv>);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      { auth: { signInWithOtp } } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );
  });

  it("asks Auth for a magic link without permitting identity creation", async () => {
    signInWithOtp.mockResolvedValue({ data: {}, error: null });

    await expect(request(" Member@Example.test ")).resolves.toEqual({
      sent: true,
      message: "If that address is invited, a one-time sign-in link is on its way.",
    });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "member@example.test",
      options: {
        shouldCreateUser: false,
        emailRedirectTo: "https://autohunter.example.test/auth/confirm",
      },
    });
  });

  it("returns the same generic response when Auth refuses an unknown address", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    signInWithOtp.mockResolvedValue({ data: {}, error: new Error("user not found") });

    const result = await request("unknown@example.test");

    expect(result).toEqual({
      sent: true,
      message: "If that address is invited, a one-time sign-in link is on its way.",
    });
    expect(warning).toHaveBeenCalledWith(JSON.stringify({
      event: "magic_link_request_rejected",
      reason: "auth_provider_rejected",
    }));
    expect(warning.mock.calls.flat().join(" ")).not.toContain("unknown@example.test");
  });

  it("rejects only syntactically invalid email input before contacting Auth", async () => {
    await expect(request("not-an-email")).resolves.toEqual({
      sent: false,
      message: "Enter a valid email address.",
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });
});
