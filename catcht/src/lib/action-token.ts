import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const payloadSchema = z.object({
  listingId: z.string().min(1).max(200),
  action: z.enum(["interested", "ignored"]),
  recipientId: z.string().min(1).max(100),
  purpose: z.literal("decision"),
  jti: z.string().uuid(),
  exp: z.number().int().positive(),
});

export type ActionTokenPayload = z.infer<typeof payloadSchema>;

function signature(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(`catcht:action:v2:${encodedPayload}`).digest("base64url");
}

export function createActionToken(
  payload: Omit<ActionTokenPayload, "exp" | "purpose" | "jti">,
  secret: string,
  now = new Date(),
  tokenId = randomUUID(),
): string {
  if (secret.length < 24) throw new Error("ACTION_SIGNING_SECRET must be at least 24 characters");
  const encoded = Buffer.from(
    JSON.stringify({
      ...payload,
      purpose: "decision",
      jti: tokenId,
      exp: Math.floor(now.getTime() / 1000) + 14 * 86_400,
    }),
  ).toString("base64url");
  return `${encoded}.${signature(encoded, secret)}`;
}

export function createActionTokenPair(
  payload: Pick<ActionTokenPayload, "listingId" | "recipientId">,
  secret: string,
  now = new Date(),
) {
  const tokenId = randomUUID();
  return {
    interested: createActionToken({ ...payload, action: "interested" }, secret, now, tokenId),
    ignored: createActionToken({ ...payload, action: "ignored" }, secret, now, tokenId),
  };
}

export function verifyActionToken(token: string, secret: string, now = new Date()): ActionTokenPayload {
  const [encoded, supplied, extra] = token.split(".");
  if (!encoded || !supplied || extra) throw new Error("invalid action token");
  const expected = signature(encoded, secret);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    throw new Error("invalid action token signature");
  }
  const parsed = payloadSchema.parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
  if (parsed.exp < Math.floor(now.getTime() / 1000)) throw new Error("action token expired");
  return parsed;
}
