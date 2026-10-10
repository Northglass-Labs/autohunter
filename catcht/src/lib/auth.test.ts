import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { claimUserProfile, getUserProfileByAuthUserId, type UserProfile } from "./dal";
import { createSupabaseServerClient } from "./supabase/server";
import { currentUser, requirePageUser, requireUser } from "./auth";

vi.mock("./dal", () => ({
  claimUserProfile: vi.fn(),
  getUserProfileByAuthUserId: vi.fn(),
}));
vi.mock("./supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));

const authUserId = "44444444-4444-4444-8444-444444444444";
const profile: UserProfile = {
  id: "11111111-1111-4111-8111-111111111111",
  authUserId,
  email: "member@example.test",
  displayName: "Member",
  role: "member",
  active: true,
  digestEnabled: true,
  digestCadenceHours: 72,
};
const getClaims = vi.fn();

function session(methods: string[]) {
  getClaims.mockResolvedValue({
    data: { claims: { sub: authUserId, email: "Member@Example.test", amr: methods.map((method) => ({ method, timestamp: 1 })) } },
    error: null,
  });
}

describe("currentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      { auth: { getClaims } } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );
  });

  it("claims the matching invitation for a session an email link created", async () => {
    session(["magiclink"]);
    vi.mocked(getUserProfileByAuthUserId).mockResolvedValue(null);
    vi.mocked(claimUserProfile).mockResolvedValue(profile);

    await expect(currentUser()).resolves.toEqual(profile);
    expect(claimUserProfile).toHaveBeenCalledWith(authUserId, "member@example.test");
  });

  it("refuses a password session without claiming the invitation", async () => {
    // Sign-up auto-confirms, so a password sign-up for an invited address proves nothing about
    // the inbox. Such a session must never claim the profile (ADR-022).
    session(["password"]);

    await expect(currentUser()).resolves.toBeNull();
    expect(getUserProfileByAuthUserId).not.toHaveBeenCalled();
    expect(claimUserProfile).not.toHaveBeenCalled();
  });

  it("refuses a password session even when the profile is already claimed", async () => {
    session(["password"]);
    vi.mocked(getUserProfileByAuthUserId).mockResolvedValue(profile);

    await expect(currentUser()).resolves.toBeNull();
    await expect(requireUser()).rejects.toThrow("Unauthorized");
  });

  it("returns no user when the session cannot be verified", async () => {
    getClaims.mockResolvedValue({ data: null, error: new Error("invalid JWT") });

    await expect(currentUser()).resolves.toBeNull();
    expect(claimUserProfile).not.toHaveBeenCalled();
  });

  it("sends a signed-out page visit to the login screen instead of failing", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });

    await expect(requirePageUser()).rejects.toThrow("NEXT_REDIRECT /login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
