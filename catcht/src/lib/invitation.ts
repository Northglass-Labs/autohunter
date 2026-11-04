import "server-only";
import { normalizeEmail } from "./auth-policy";
import {
  bindUserProfileAuthIdentity,
  getUserProfileById,
  inviteUserProfile,
  type UserProfile,
} from "./dal";
import { createSupabaseAdminClient } from "./supabase/admin";

function matchesEmail(candidate: string | null | undefined, email: string): boolean {
  if (!candidate) return false;
  try {
    return normalizeEmail(candidate) === email;
  } catch {
    return false;
  }
}

function matchesIdentity(
  user: { id: string; email?: string | null } | null,
  expectedId: string,
  email: string,
): boolean {
  return Boolean(user && user.id === expectedId && matchesEmail(user.email, email));
}

function matchesBoundProfile(
  candidate: UserProfile | null,
  reserved: UserProfile,
  email: string,
): candidate is UserProfile {
  if (
    !candidate?.active ||
    candidate.id !== reserved.id ||
    candidate.authUserId !== reserved.id ||
    !matchesEmail(candidate.email, email)
  ) {
    return false;
  }
  return true;
}

async function readExactBinding(
  profile: UserProfile,
  email: string,
): Promise<UserProfile | null> {
  try {
    const current = await getUserProfileById(profile.id);
    return matchesBoundProfile(current, profile, email) ? current : null;
  } catch {
    return null;
  }
}

export async function preprovisionInvitation(
  requestedEmail: string,
  displayName: string,
): Promise<UserProfile> {
  const email = normalizeEmail(requestedEmail);
  const profile = await inviteUserProfile(email, displayName);
  const supabase = createSupabaseAdminClient();

  if (profile.authUserId) {
    const existing = await supabase.auth.admin.getUserById(profile.authUserId);
    if (
      existing.error ||
      !matchesIdentity(existing.data.user, profile.authUserId, email) ||
      !matchesEmail(profile.email, email)
    ) {
      throw new Error("The bound invitation identity could not be safely verified.");
    }
    return profile;
  }

  const created = await supabase.auth.admin.createUser({
    id: profile.id,
    email,
    email_confirm: true,
  });

  let identity = created.data.user;
  if (!matchesIdentity(identity, profile.id, email)) {
    const existing = await supabase.auth.admin.getUserById(profile.id);
    identity = existing.error ? null : existing.data.user;
  }

  if (!matchesIdentity(identity, profile.id, email)) {
    throw new Error("The invitation identity could not be safely provisioned.");
  }

  try {
    const bound = await bindUserProfileAuthIdentity(profile.id, profile.id, email);
    if (matchesBoundProfile(bound, profile, email)) return bound;
  } catch {
    // The database may have committed before its response failed. Reconcile below.
  }

  const reconciled = await readExactBinding(profile, email);
  if (reconciled) return reconciled;

  // Do not delete here: a concurrent or ambiguously committed bind may own this
  // deterministic identity after the read. Retaining it is fail-closed and retryable.
  throw new Error("The invitation identity could not be safely bound.");
}
