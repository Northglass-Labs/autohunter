import { NextResponse } from "next/server";
import { verifyActionToken } from "@/lib/action-token";
import { getCoreEnv } from "@/lib/env";
import { consumeDecisionAndSetDisposition, getUserProfileById } from "@/lib/dal";

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  try {
    const payload = verifyActionToken(token, getCoreEnv().ACTION_SIGNING_SECRET);
    if (!(await getUserProfileById(payload.recipientId))) throw new Error("unknown recipient");
    await consumeDecisionAndSetDisposition(
      payload.jti,
      payload.recipientId,
      payload.listingId,
      payload.action,
      new Date(payload.exp * 1_000),
    );
    return NextResponse.redirect(new URL(`/action/done?action=${payload.action}`, request.url), 303);
  } catch {
    return NextResponse.redirect(new URL("/access-denied", request.url), 303);
  }
}
