import type { SupabaseClient } from "@supabase/supabase-js";

// Ordinary application sign-out must not revoke refresh tokens belonging to the user's other
// devices. Account-wide revocation is a separate administrative operation.
export async function signOutCurrentSession(client: SupabaseClient): Promise<void> {
  await client.auth.signOut({ scope: "local" });
}
