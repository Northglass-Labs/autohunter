import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  failDigestRun,
  finishDigestRun,
  getDigestCandidates,
  getDigestRecipients,
  getRecipientOfferKinds,
  getSourceHealth,
  lastDigestEmailDate,
  startDigestRun,
  type ListingCard,
  type SourceHealth,
  type UserProfile,
} from "./dal";
import { sendDigest } from "./email";
import { runDigest } from "./digest";

vi.mock("./dal", () => ({
  failDigestRun: vi.fn(),
  finishDigestRun: vi.fn(),
  getDigestCandidates: vi.fn(),
  getDigestRecipients: vi.fn(),
  getRecipientOfferKinds: vi.fn(),
  getSourceHealth: vi.fn(),
  lastDigestEmailDate: vi.fn(),
  startDigestRun: vi.fn(),
}));

vi.mock("./email", () => ({ sendDigest: vi.fn() }));

const runId = "22222222-2222-4222-8222-222222222222";
const providerMessageId = "resend-message-private";
const recipient: UserProfile = {
  id: "11111111-1111-4111-8111-111111111111",
  authUserId: null,
  email: "recipient@example.test",
  displayName: "Household member",
  role: "member",
  active: true,
  digestEnabled: true,
  digestCadenceHours: 23,
};
const listing = { id: "33333333-3333-4333-8333-333333333333", price: 52_000, effectiveMonthly: null } as ListingCard;
// 15:00 UTC is 11:00 in New York, so this run is scheduled for 2026-10-09.
const now = new Date("2026-10-09T15:00:00Z");

function source(name: string): SourceHealth {
  return {
    source: name,
    adapter: `${name}-v1`,
    status: "success",
    messageCode: null,
    searchedCount: 2,
    discoveredCount: 4,
    acceptedCount: 1,
    finishedAt: "2026-10-09T14:00:00.000Z",
    lastDiscoveryAt: "2026-10-09T14:00:00.000Z",
  };
}

describe("runDigest", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getDigestRecipients).mockResolvedValue([recipient]);
    vi.mocked(getSourceHealth).mockResolvedValue([]);
    vi.mocked(getRecipientOfferKinds).mockResolvedValue(["lease"]);
    vi.mocked(startDigestRun).mockResolvedValue(runId);
    vi.mocked(sendDigest).mockResolvedValue(providerMessageId);
    vi.mocked(finishDigestRun).mockResolvedValue(undefined);
    vi.mocked(failDigestRun).mockResolvedValue(undefined);
  });

  it("returns aggregate scheduler telemetry without user or provider identifiers", async () => {
    vi.mocked(getDigestCandidates).mockResolvedValue([listing]);

    const result = await runDigest(now);

    expect(result).toEqual({ status: "sent", recipientCount: 1, sentCount: 1, quietCount: 0, listingCount: 1 });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(recipient.id);
    expect(serialized).not.toContain(providerMessageId);
    expect(startDigestRun).toHaveBeenCalledWith(recipient.id, "2026-10-09");
    expect(finishDigestRun).toHaveBeenCalledWith(runId, [listing], providerMessageId, []);
  });

  it("stays quiet on an empty day when the recipient was emailed within the last week", async () => {
    vi.mocked(getDigestCandidates).mockResolvedValue([]);
    vi.mocked(lastDigestEmailDate).mockResolvedValue("2026-10-03");

    const result = await runDigest(now);

    expect(result).toEqual({ status: "complete", recipientCount: 1, sentCount: 0, quietCount: 1, listingCount: 0 });
    expect(startDigestRun).not.toHaveBeenCalled();
    expect(sendDigest).not.toHaveBeenCalled();
  });

  it("sends a weekly check-in after seven quiet days, reporting only the recipient's sources", async () => {
    const leaseFeed = source("marketcheck_incentives");
    vi.mocked(getSourceHealth).mockResolvedValue([source("marketcheck"), leaseFeed, source("leasehackr")]);
    vi.mocked(getDigestCandidates).mockResolvedValue([]);
    vi.mocked(lastDigestEmailDate).mockResolvedValue("2026-10-02");

    const result = await runDigest(now);

    expect(result).toMatchObject({ status: "sent", sentCount: 1, quietCount: 0, listingCount: 0 });
    expect(sendDigest).toHaveBeenCalledWith(recipient, [], "2026-10-09", [leaseFeed], { lastEmailedOn: "2026-10-02" });
    expect(finishDigestRun).toHaveBeenCalledWith(runId, [], providerMessageId, [leaseFeed]);
  });

  it("checks in with a recipient who has never been emailed", async () => {
    vi.mocked(getDigestCandidates).mockResolvedValue([]);
    vi.mocked(lastDigestEmailDate).mockResolvedValue(null);

    await runDigest(now);

    expect(sendDigest).toHaveBeenCalledWith(recipient, [], "2026-10-09", [], { lastEmailedOn: null });
  });

  it("limits daily recipients by calendar date rather than elapsed hours", async () => {
    // The scheduled workflow starts several hours late by a varying amount. A 23-hour gate
    // skipped every day whose run started earlier in the day than the previous one.
    vi.mocked(getDigestCandidates).mockResolvedValue([listing]);
    vi.mocked(lastDigestEmailDate).mockResolvedValue("2026-10-08");

    await runDigest(now);

    expect(sendDigest).toHaveBeenCalledTimes(1);
  });

  it.each([
    [72, "2026-10-07", false],
    [72, "2026-10-06", true],
    [168, "2026-10-03", false],
    [168, "2026-10-02", true],
  ])("with a %i-hour cadence and the last report on %s, sends today: %s", async (digestCadenceHours, lastEmailedOn, sends) => {
    // A longer cadence counts Eastern calendar days too. The last report may have gone out later
    // in the day than this run starts, and an elapsed-hours gate then slipped it a day.
    vi.mocked(getDigestRecipients).mockResolvedValue([{ ...recipient, digestCadenceHours }]);
    vi.mocked(getDigestCandidates).mockResolvedValue([listing]);
    vi.mocked(lastDigestEmailDate).mockResolvedValue(lastEmailedOn);

    const result = await runDigest(now);

    expect(result.sentCount).toBe(sends ? 1 : 0);
    expect(getDigestCandidates).toHaveBeenCalledTimes(sends ? 1 : 0);
  });

  it("records a failed run and surfaces the delivery error", async () => {
    vi.mocked(getDigestCandidates).mockResolvedValue([listing]);
    vi.mocked(sendDigest).mockRejectedValue(new Error("provider rejected the message"));

    await expect(runDigest(now)).rejects.toThrow("provider rejected the message");
    expect(failDigestRun).toHaveBeenCalledWith(runId, "provider rejected the message");
    expect(finishDigestRun).not.toHaveBeenCalled();
  });
});
