import { describe, expect, it } from "vitest";
import { createActionToken, createActionTokenPair, verifyActionToken } from "./action-token";

describe("action tokens", () => {
  const secret = "test-secret-that-is-long-enough-for-hmac";

  it("round trips a purpose-bound interested action", () => {
    const token = createActionToken(
      { listingId: "listing-1", action: "interested", recipientId: "driver" },
      secret,
      new Date("2026-07-11T12:00:00Z"),
    );
    expect(verifyActionToken(token, secret, new Date("2026-07-12T12:00:00Z"))).toMatchObject({
      listingId: "listing-1",
      action: "interested",
      recipientId: "driver",
      purpose: "decision",
    });
  });

  it("gives Interested and Ignore one replay key so only the first decision can win", () => {
    const now = new Date("2026-07-11T12:00:00Z");
    const pair = createActionTokenPair(
      { listingId: "listing-1", recipientId: "driver" },
      secret,
      now,
    );
    const interested = verifyActionToken(pair.interested, secret, now);
    const ignored = verifyActionToken(pair.ignored, secret, now);

    expect(interested.action).toBe("interested");
    expect(ignored.action).toBe("ignored");
    expect(interested.jti).toBe(ignored.jti);
  });

  it("rejects tampering and expiration", () => {
    const now = new Date("2026-07-11T12:00:00Z");
    const token = createActionToken({ listingId: "1", action: "ignored", recipientId: "driver" }, secret, now);
    expect(() => verifyActionToken(`${token}x`, secret, now)).toThrow();
    expect(() => verifyActionToken(token, secret, new Date("2026-08-20T12:00:00Z"))).toThrow("expired");
  });
});
