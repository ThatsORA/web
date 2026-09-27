import { describe, expect, it } from "vitest";
import { resolveManualSelection } from "./manualSelection";

const friend = (lowId: string, highId: string, status = "accepted") => ({
  userLowId: lowId,
  userHighId: highId,
  lowAddedHigh: true,
  highAddedLow: true,
  status,
});
const squads = [
  { id: "first", members: [
    { userId: "a", status: "active" }, { userId: "b", status: "active" },
    { userId: "c", status: "active" }, { userId: "pending", status: "invited" },
  ] },
  { id: "second", members: [
    { userId: "a", status: "active" }, { userId: "c", status: "active" },
    { userId: "d", status: "active" },
  ] },
];

describe("resolveManualSelection", () => {
  it("expands two squads, excludes pending members, and gives squad rules to an overlapping direct pick", () => {
    expect(resolveManualSelection("a", ["second", "first", "first"], ["c", "e"], squads, [friend("a", "c"), friend("a", "e")])).toEqual({
      squadIds: ["first", "second"],
      memberIds: ["a", "b", "c", "d", "e"],
      participants: [
        { userId: "a", inviteSource: "creator", sourceSquadIds: ["first", "second"] },
        { userId: "b", inviteSource: "squad", sourceSquadIds: ["first"] },
        { userId: "c", inviteSource: "squad", sourceSquadIds: ["first", "second"] },
        { userId: "d", inviteSource: "squad", sourceSquadIds: ["second"] },
        { userId: "e", inviteSource: "direct", sourceSquadIds: [] },
      ],
    });
  });

  it("accepts one direct friend when no squad is selected", () => {
    expect(resolveManualSelection("a", [], ["b"], [], [friend("a", "b")])).toMatchObject({
      memberIds: ["a", "b"],
      participants: [{ inviteSource: "creator" }, { inviteSource: "direct" }],
    });
  });

  it("requires the caller to be active in every selected squad", () => {
    expect(resolveManualSelection("a", ["missing"], [], squads, [])).toEqual({ error: "invalid_squads" });
    expect(resolveManualSelection("a", ["first", "inactive"], [], [...squads, {
      id: "inactive", members: [{ userId: "a", status: "invited" }, { userId: "f", status: "active" }],
    }], [])).toEqual({ error: "invalid_squads" });
  });

  it("validates every direct pick, including one also found through a squad", () => {
    expect(resolveManualSelection("a", ["first"], ["c"], squads, [])).toEqual({ error: "invalid_invitees" });
    expect(resolveManualSelection("a", [], ["b"], [], [friend("a", "b", "pending")])).toEqual({ error: "invalid_invitees" });
    expect(resolveManualSelection("a", [], ["a"], [], [])).toEqual({ error: "invalid_invitees" });
  });

  it("rejects empty and over-capacity selections before matching", () => {
    expect(resolveManualSelection("a", [], [], [], [])).toEqual({ error: "invalid_selection" });
    expect(resolveManualSelection("a", ["first"], ["e", "f", "g", "h"], squads,
      [friend("a", "e"), friend("a", "f"), friend("a", "g"), friend("a", "h")])).toEqual({ error: "invalid_selection" });
  });
});
