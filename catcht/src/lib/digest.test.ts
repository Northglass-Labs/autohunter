import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  digestIsDue,
  failDigestRun,
  finishDigestRun,
  getDigestCandidates,
  getDigestRecipients,
  getSourceHealth,
  startDigestRun,
} from "./dal";
import { sendDigest } from "./email";
import { runDigest } from "./digest";

vi.mock("./dal", () => ({
  digestIsDue: vi.fn(),
  failDigestRun: vi.fn(),
  finishDigestRun: vi.fn(),
  getDigestCandidates: vi.fn(),
  getDigestRecipients: vi.fn(),
  getSourceHealth: vi.fn(),
  startDigestRun: vi.fn(),
}));

vi.mock("./email", () => ({ sendDigest: vi.fn() }));

describe("runDigest", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns aggregate scheduler telemetry without user or provider identifiers", async () => {
    const privateUserId = "11111111-1111-4111-8111-111111111111";
    const privateProviderMessageId = "resend-message-private";
    vi.mocked(getDigestRecipients).mockResolvedValue([{
      id: privateUserId,
      authUserId: null,
      email: "recipient@example.test",
      displayName: "Household member",
      role: "member",
      active: true,
      digestEnabled: true,
      digestCadenceHours: 23,
    }]);
    vi.mocked(getSourceHealth).mockResolvedValue([]);
    vi.mocked(digestIsDue).mockResolvedValue(true);
    vi.mocked(startDigestRun).mockResolvedValue("22222222-2222-4222-8222-222222222222");
    vi.mocked(getDigestCandidates).mockResolvedValue([]);
    vi.mocked(sendDigest).mockResolvedValue(privateProviderMessageId);
    vi.mocked(finishDigestRun).mockResolvedValue(undefined);
    vi.mocked(failDigestRun).mockResolvedValue(undefined);

    const result = await runDigest();

    expect(result).toEqual({
      status: "sent",
      recipientCount: 1,
      sentCount: 1,
      listingCount: 0,
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(privateUserId);
    expect(serialized).not.toContain(privateProviderMessageId);
    expect(finishDigestRun).toHaveBeenCalledWith(
      "22222222-2222-4222-8222-222222222222",
      [],
      privateProviderMessageId,
      [],
    );
  });
});
