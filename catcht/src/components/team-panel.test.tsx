import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SavedSearch, UserProfile } from "@/lib/dal";

vi.mock("@/app/actions", () => ({
  inviteUserAction: vi.fn(),
  setSavedSearchOwnerAction: vi.fn(),
}));

import { TeamPanel } from "./team-panel";

const people: UserProfile[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    authUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    email: "admin@example.test",
    displayName: "Admin",
    role: "admin",
    active: true,
    digestEnabled: true,
    digestCadenceHours: 23,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    authUserId: null,
    email: "member@example.test",
    displayName: "Member",
    role: "member",
    active: true,
    digestEnabled: true,
    digestCadenceHours: 23,
  },
];

const search: SavedSearch = {
  id: "33333333-3333-4333-8333-333333333333",
  ownerId: people[0].id,
  ownerName: "Admin",
  name: "Rivian R1S under 65k",
  offerKind: "used",
  make: "Rivian",
  model: "R1S",
  trim: null,
  zip: "10001",
  radiusMiles: 100,
  region: null,
  transmission: "automatic",
  maxPrice: 65_000,
  maxMileage: 60_000,
  maxEffectiveMonthly: null,
  maxDueAtSigning: null,
  minAnnualMiles: null,
  aliases: [],
  sourceIds: {},
  active: true,
  profile: "family_ev",
  garageGroup: "ev",
  powertrainCategory: "ev",
  yearMin: 2022,
  yearMax: 2026,
  targetPrice: 58_000,
  trimAliases: [],
  desiredFeatures: ["third_row"],
  requiredFeatures: [],
  rationale: null,
  priority: 90,
};

describe("TeamPanel", () => {
  it("shows access status, an invite form, and search ownership controls", () => {
    const html = renderToStaticMarkup(<TeamPanel people={people} searches={[search]} />);

    expect(html).toContain("Household access");
    expect(html).toContain("Admin");
    expect(html).toContain("Signed in before");
    expect(html).toContain("Member");
    expect(html).toContain("Invite pending");
    expect(html).toContain("Invite a driver");
    expect(html).toContain("Rivian R1S under 65k");
    expect(html).toContain("Move searches between queues");
    expect(html).toContain("name=\"ownerId\"");
  });
});
