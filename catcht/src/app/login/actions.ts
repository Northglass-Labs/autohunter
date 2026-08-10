"use server";

import { getUserProfileByEmail } from "@/lib/dal";
import { normalizeEmail } from "@/lib/auth-policy";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCoreEnv } from "@/lib/env";

export interface MagicLinkState {
  sent: boolean;
  message: string | null;
}

export async function requestMagicLinkAction(
  _state: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  let email: string;
  try {
    email = normalizeEmail(String(formData.get("email") ?? ""));
  } catch {
    return { sent: false, message: "Enter a valid email address." };
  }

  const profile = await getUserProfileByEmail(email);
  if (profile) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${getCoreEnv().APP_URL}/auth/confirm`,
      },
    });
    if (error) return { sent: false, message: "We could not send a sign-in link. Try again in a minute." };
  }

  return {
    sent: true,
    message: "If that address is invited, a one-time sign-in link is on its way.",
  };
}
