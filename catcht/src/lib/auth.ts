import "server-only";
import { redirect } from "next/navigation";
import { getUserProfileByAuthUserId, type UserProfile } from "./dal";
import { isEmailLinkSession } from "./auth-policy";
import { createSupabaseServerClient } from "./supabase/server";

export async function currentUser(): Promise<UserProfile | null> {
  const supabase = await createSupabaseServerClient();
  // getClaims verifies the token (with Auth for symmetric keys, locally for asymmetric ones) before
  // the authentication methods it carries are trusted.
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  // Only an email link proves control of the invited inbox (ADR-022).
  if (!isEmailLinkSession(claims.amr)) return null;

  return getUserProfileByAuthUserId(claims.sub);
}

export async function requireUser(requiredRole?: UserProfile["role"]) {
  const user = await currentUser();
  if (!user || (requiredRole && user.role !== requiredRole)) throw new Error("Unauthorized");
  return user;
}

// Protected pages send a signed-out visitor to the login screen; Server Actions keep throwing.
export async function requirePageUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
