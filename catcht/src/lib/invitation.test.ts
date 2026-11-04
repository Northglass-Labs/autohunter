import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  bindUserProfileAuthIdentity,
  inviteUserProfile,
  type UserProfile,
} from "./dal";
import { preprovisionInvitation } from "./invitation";
import { createSupabaseAdminClient } from "./supabase/admin";

vi.mock("./dal", () => ({
  bindUserProfileAuthIdentity: vi.fn(),
  inviteUserProfile: vi.fn(),
}));
vi.mock("./supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

const id = "22222222-2222-4222-8222-222222222222";
const email = "member@example.test";
const pendingProfile: UserProfile = {
  id,
  authUserId: null,
  email,
  displayName: "Member",
  role: "member",
  active: true,
  digestEnabled: true,
  digestCadenceHours: 23,
};
const boundProfile = { ...pendingProfile, authUserId: id };
const createUser = vi.fn();
const getUserById = vi.fn();
const deleteUser = vi.fn();

describe("preprovisionInvitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(inviteUserProfile).mockResolvedValue(pendingProfile);
    vi.mocked(bindUserProfileAuthIdentity).mockResolvedValue(boundProfile);
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      auth: { admin: { createUser, getUserById, deleteUser } },
    } as unknown as ReturnType<typeof createSupabaseAdminClient>);
  });

  it("creates an email-only Auth identity at the profile UUID and binds it", async () => {
    createUser.mockResolvedValue({ data: { user: { id, email } }, error: null });

    await expect(preprovisionInvitation(email, "Member")).resolves.toEqual(boundProfile);

    expect(createUser).toHaveBeenCalledWith({ id, email, email_confirm: true });
    expect(bindUserProfileAuthIdentity).toHaveBeenCalledWith(id, id, email);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("does not create another identity for an already-bound profile", async () => {
    vi.mocked(inviteUserProfile).mockResolvedValue(boundProfile);

    await expect(preprovisionInvitation(email, "Member")).resolves.toEqual(boundProfile);

    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
  });

  it("recovers an uncertain retry only when the deterministic identity has the exact email", async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: new Error("already registered") });
    getUserById.mockResolvedValue({ data: { user: { id, email: "Member@Example.test" } }, error: null });

    await expect(preprovisionInvitation(email, "Member")).resolves.toEqual(boundProfile);

    expect(bindUserProfileAuthIdentity).toHaveBeenCalledWith(id, id, email);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("fails closed when an address collision does not belong to the deterministic identity", async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: new Error("already registered") });
    getUserById.mockResolvedValue({ data: { user: null }, error: new Error("not found") });

    await expect(preprovisionInvitation(email, "Member")).rejects.toThrow("could not be safely provisioned");

    expect(bindUserProfileAuthIdentity).not.toHaveBeenCalled();
  });

  it("removes a newly created identity when the profile cannot be bound", async () => {
    createUser.mockResolvedValue({ data: { user: { id, email } }, error: null });
    vi.mocked(bindUserProfileAuthIdentity).mockResolvedValue(null);
    deleteUser.mockResolvedValue({ data: null, error: null });

    await expect(preprovisionInvitation(email, "Member")).rejects.toThrow("could not be safely bound");

    expect(deleteUser).toHaveBeenCalledWith(id);
  });

  it("removes a newly created identity when binding throws", async () => {
    createUser.mockResolvedValue({ data: { user: { id, email } }, error: null });
    vi.mocked(bindUserProfileAuthIdentity).mockRejectedValue(new Error("database unavailable"));
    deleteUser.mockResolvedValue({ data: null, error: null });

    await expect(preprovisionInvitation(email, "Member")).rejects.toThrow("could not be safely bound");

    expect(deleteUser).toHaveBeenCalledWith(id);
  });
});
