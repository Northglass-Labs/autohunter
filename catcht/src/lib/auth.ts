import "server-only";
import { claimUserProfile, getUserProfileByAuthUserId, type UserProfile } from "./dal";
import { normalizeEmail } from "./auth-policy";
import { createSupabaseServerClient } from "./supabase/server";

export async function currentUser(): Promise<UserProfile | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.id || !user.email) return null;

  const existing = await getUserProfileByAuthUserId(user.id);
  if (existing) return existing;
  return claimUserProfile(user.id, normalizeEmail(user.email));
}

export async function requireUser(requiredRole?: UserProfile["role"]) {
  const user = await currentUser();
  if (!user || (requiredRole && user.role !== requiredRole)) throw new Error("Unauthorized");
  return user;
}
