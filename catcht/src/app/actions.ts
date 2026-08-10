"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addSavedSearch,
  inviteUserProfile,
  setDisposition,
  setSavedSearchActive,
  setSavedSearchOwner,
} from "@/lib/dal";
import { requireUser } from "@/lib/auth";
import { normalizeEmail } from "@/lib/auth-policy";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  dispositionInputSchema,
  entityIdSchema,
  savedSearchInputSchema,
} from "@/lib/saved-search-schema";

export interface AddSavedSearchState {
  ok: boolean;
  message: string | null;
}

export async function addSavedSearchAction(
  _state: AddSavedSearchState,
  formData: FormData,
): Promise<AddSavedSearchState> {
  const user = await requireUser();
  const parsed = savedSearchInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Review the search settings and try again.",
    };
  }
  const added = await addSavedSearch(user.id, parsed.data);
  if (!added) return { ok: false, message: "An active search already uses that name." };
  revalidatePath("/");
  return { ok: true, message: `${parsed.data.name} is now on the radar.` };
}

export async function setSavedSearchActiveAction(id: string, active: boolean) {
  const user = await requireUser();
  await setSavedSearchActive(user.id, entityIdSchema.parse(id), active);
  revalidatePath("/");
}

export async function setDispositionAction(id: string, disposition: "neutral" | "interested" | "ignored") {
  const user = await requireUser();
  await setDisposition(user.id, entityIdSchema.parse(id), dispositionInputSchema.parse(disposition));
  revalidatePath("/");
}

export interface InviteUserState {
  ok: boolean;
  message: string | null;
}

export async function inviteUserAction(_state: InviteUserState, formData: FormData): Promise<InviteUserState> {
  await requireUser("admin");
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName || displayName.length > 100) return { ok: false, message: "Enter a short display name." };
  try {
    const email = normalizeEmail(String(formData.get("email") ?? ""));
    await inviteUserProfile(email, displayName);
    revalidatePath("/");
    return { ok: true, message: `${displayName} can now request an AutoHunter magic link.` };
  } catch {
    return { ok: false, message: "Enter a valid email that is not already assigned." };
  }
}

export async function setSavedSearchOwnerAction(formData: FormData) {
  await requireUser("admin");
  const searchId = entityIdSchema.parse(formData.get("searchId"));
  const ownerId = entityIdSchema.parse(formData.get("ownerId"));
  await setSavedSearchOwner(searchId, ownerId);
  revalidatePath("/");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
