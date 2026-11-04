import { beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminEnv } from "./config";
import { createSupabaseAdminClient } from "./admin";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => ({ auth: { admin: {} } })) }));
vi.mock("./config", () => ({ getSupabaseAdminEnv: vi.fn() }));

describe("createSupabaseAdminClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSupabaseAdminEnv).mockReturnValue({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SECRET_KEY: "sb_secret_test-only-value",
    });
  });

  it("uses the server-only secret with all session persistence disabled", () => {
    createSupabaseAdminClient();

    expect(createClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "sb_secret_test-only-value",
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    );
  });
});
