import "server-only";
import { normalizeEmail } from "./auth-policy";
import {
  bindUserProfileAuthIdentity,
  inviteUserProfile,
  type UserProfile,
} from "./dal";
import { createSupabaseAdminClient } from "./supabase/admin";

function matchesReservedIdentity(
  user: { id: string; email?: string | null } | null,
  profile: UserProfile,
  email: string,
): boolean {
  if (!user?.email || user.id !== profile.id) return false;
  try {
    return normalizeEmail(user.email) === email;
  } catch {
    return false;
  }
}

export async function preprovisionInvitation(
  requestedEmail: string,
  displayName: string,
): Promise<UserProfile> {
  const email = normalizeEmail(requestedEmail);
  const profile = await inviteUserProfile(email, displayName);
  if (profile.authUserId) return profile;

  const supabase = createSupabaseAdminClient();
  const created = await supabase.auth.admin.createUser({
    id: profile.id,
    email,
    email_confirm: true,
  });

  let identity = created.data.user;
  let createdHere = !created.error && Boolean(identity);
  if (!matchesReservedIdentity(identity, profile, email)) {
    if (createdHere && identity) await supabase.auth.admin.deleteUser(identity.id);
    createdHere = false;
    const existing = await supabase.auth.admin.getUserById(profile.id);
    identity = existing.error ? null : existing.data.user;
  }

  if (!matchesReservedIdentity(identity, profile, email)) {
    throw new Error("The invitation identity could not be safely provisioned.");
  }

  let bound: UserProfile | null;
  try {
    bound = await bindUserProfileAuthIdentity(profile.id, profile.id, email);
  } catch {
    if (createdHere) await supabase.auth.admin.deleteUser(profile.id);
    throw new Error("The invitation identity could not be safely bound.");
  }
  if (bound) return bound;

  if (createdHere) await supabase.auth.admin.deleteUser(profile.id);
  throw new Error("The invitation identity could not be safely bound.");
}
