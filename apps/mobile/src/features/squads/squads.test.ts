import { describe, expect, it } from "vitest";
import { invitable, isWaiting, memberBadge, splitSquads, squadErrorMessage, type SquadT } from "./squads";

const now = new Date("2026-09-26T12:00:00Z");
const member = (id: string, status: "invited" | "active", joins_at: string | null = null) => ({ id, username: id, display_name: id, status, joins_at });
const squad = (id: string, my_status: "invited" | "active"): SquadT => ({
  id,
  name: id,
  my_status,
  members: [member("a", "active"), member("b", "invited")],
});

describe("squads view", () => {
  it("splits invites from my squads", () => {
    const { invites, mine } = splitSquads([squad("s1", "invited"), squad("s2", "active")]);
    expect(invites.map((s) => s.id)).toEqual(["s1"]);
    expect(mine.map((s) => s.id)).toEqual(["s2"]);
  });

  it("isWaiting returns false because acceptance is instant", () => {
    const s = squad("s", "invited");
    expect(isWaiting(s, "b")).toBe(false);
    expect(isWaiting(s, null)).toBe(false);
  });

  it("only offers friends who aren't already in the squad", () => {
    const friends = [{ id: "a", username: "a", display_name: "a", close: false }, { id: "c", username: "c", display_name: "c", close: true }];
    expect(invitable(friends, squad("s", "active")).map((f) => f.id)).toEqual(["c"]);
    expect(invitable(friends)).toHaveLength(2);
  });

  it("badges invited members with Invited tag and active members with null", () => {
    expect(memberBadge(member("a", "active"), now)).toBeNull();
    expect(memberBadge(member("b", "invited"), now)).toBe("Invited");
  });

  it("maps server error codes to messages", () => {
    expect(squadErrorMessage("squad_full")).toMatch(/6 people/);
    expect(squadErrorMessage("not_friends")).toMatch(/friends/);
    expect(squadErrorMessage(undefined)).toMatch(/server/);
  });
});
