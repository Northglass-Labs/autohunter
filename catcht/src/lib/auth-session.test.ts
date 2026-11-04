import { describe, expect, it, vi } from "vitest";

import { signOutCurrentSession } from "./auth-session";

describe("signOutCurrentSession", () => {
  it("revokes only the current session rather than every device session", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });

    await signOutCurrentSession({ auth: { signOut } } as never);

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
