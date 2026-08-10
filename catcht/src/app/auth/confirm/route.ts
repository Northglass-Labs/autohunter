import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { normalizeEmail, safeNextPath } from "@/lib/auth-policy";
import { claimUserProfile } from "@/lib/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCoreEnv } from "@/lib/env";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const appUrl = getCoreEnv().APP_URL;

  if (tokenHash && type) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id && user.email) {
        const profile = await claimUserProfile(user.id, normalizeEmail(user.email));
        if (profile) {
          return NextResponse.redirect(new URL(next, appUrl));
        }
      }
      await supabase.auth.signOut();
    }
  }

  return NextResponse.redirect(new URL("/auth/error", appUrl));
}
