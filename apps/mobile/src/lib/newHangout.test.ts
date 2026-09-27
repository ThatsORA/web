import { CreateEventRequest } from "@web/contract";
import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { MAX_INVITEES, buildCreateEventRequest, getDeduplicatedInvitees, getSelectedSquadMembers, noMatchReason, otherWeek, toggleInvitee, weekRange } from "./newHangout";

const ids = Array.from({ length: 6 }, (_, i) => `00000000-0000-4000-8000-00000000000${i}`);

describe("toggleInvitee", () => {
  it("adds and removes", () => {
    expect(toggleInvitee([], ids[0])).toEqual([ids[0]]);
    expect(toggleInvitee([ids[0], ids[1]], ids[0])).toEqual([ids[1]]);
  });

  it("stops at 5, but still lets you remove", () => {
    const five = ids.slice(0, 5);
    expect(toggleInvitee(five, ids[5])).toEqual(five);
    expect(toggleInvitee(five, ids[2])).toHaveLength(4);
  });

  it("matches the contract's limit", () => {
    expect(CreateEventRequest.safeParse({ invitee_ids: ids.slice(0, MAX_INVITEES) }).success).toBe(true);
    expect(CreateEventRequest.safeParse({ invitee_ids: ids.slice(0, MAX_INVITEES + 1) }).success).toBe(false);
  });
});

describe("weekRange", () => {
  const wed = new Date(2026, 8, 30, 15, 0); // Wed 30 Sep 2026, 3pm local
  const nextMon = new Date(2026, 9, 5).toISOString();

  it("this week runs from now to next Monday 00:00", () => {
    expect(weekRange("this", wed)).toEqual({ earliest: wed.toISOString(), latest: nextMon });
  });

  it("next week runs Monday to Monday", () => {
    expect(weekRange("next", wed)).toEqual({ earliest: nextMon, latest: new Date(2026, 9, 12).toISOString() });
  });

  it("on a Sunday, next week starts tomorrow; on a Monday, a week out", () => {
    expect(weekRange("next", new Date(2026, 9, 4, 20)).earliest).toBe(nextMon);
    expect(weekRange("next", new Date(2026, 9, 5, 9)).earliest).toBe(new Date(2026, 9, 12).toISOString());
  });
});

describe("otherWeek", () => {
  it("flips this and next; any time moves to next", () => {
    expect(otherWeek("this")).toBe("next");
    expect(otherWeek("next")).toBe("this");
    expect(otherWeek(null)).toBe("next");
  });
});

describe("buildCreateEventRequest", () => {
  const now = new Date(2026, 8, 30, 15, 0);

  it("sends only the invitees when nothing optional is picked", () => {
    expect(buildCreateEventRequest({ inviteeIds: [ids[0]], vibe: null, week: null }, now)).toEqual({ invitee_ids: [ids[0]] });
  });

  it("adds the vibe and the week range", () => {
    expect(buildCreateEventRequest({ inviteeIds: [ids[0], ids[1]], vibe: "dinner", week: "next" }, now)).toEqual({
      invitee_ids: [ids[0], ids[1]],
      vibe_tag: "dinner",
      ...weekRange("next", now),
    });
  });

  it("includes squad_ids when squadIds is passed", () => {
    const squadId = "00000000-0000-4000-8000-000000000099";
    expect(buildCreateEventRequest({ inviteeIds: [ids[0]], squadIds: [squadId], vibe: null, week: null }, now)).toEqual({
      invitee_ids: [ids[0]],
      squad_ids: [squadId],
    });
  });

  it("rejects an empty selection", () => {
    expect(() => buildCreateEventRequest({ inviteeIds: [], vibe: null, week: null }, now)).toThrow();
  });
});

describe("noMatchReason", () => {
  it("tells no_common_time and no_venues apart, and ignores other errors", () => {
    expect(noMatchReason(new ApiError(422, { error: "no_common_time" }))).toBe("no_common_time");
    expect(noMatchReason(new ApiError(422, { error: "no_venues" }))).toBe("no_venues");
    expect(noMatchReason(new ApiError(400, { error: "invalid_invitees" }))).toBeNull();
    expect(noMatchReason(new Error("network"))).toBeNull();
  });
});

describe("getDeduplicatedInvitees", () => {
  const creator = ids[0];
  const squad1 = {
    id: "sq-1",
    name: "Roommates",
    members: [
      { id: creator, status: "active" },
      { id: ids[1], status: "active" },
      { id: ids[2], status: "active" },
      { id: ids[3], status: "invited" }, // non-active
    ],
  };

  it("extracts active squad members excluding creator", () => {
    const res = getDeduplicatedInvitees(["sq-1"], [], [squad1], creator);
    expect(res.inviteeIds).toEqual([ids[1], ids[2]]);
    expect(res.totalCount).toBe(3); // 2 invitees + creator
    expect(res.isValidCount).toBe(true);
  });

  it("automatically pre-fills active squad members across multiple squads without duplicate invitees", () => {
    const squad2 = {
      id: "sq-2",
      name: "Soccer Team",
      members: [
        { id: ids[2], status: "active" }, // overlapping with squad1
        { id: ids[3], status: "active" },
        { id: ids[4], status: "invited" }, // pending/invited member ignored
      ],
    };

    const res = getDeduplicatedInvitees(["sq-1", "sq-2"], [], [squad1, squad2], creator);
    expect(res.squadMemberIds).toEqual([ids[1], ids[2], ids[3]]);
    expect(res.inviteeIds).toEqual([ids[1], ids[2], ids[3]]);
    expect(res.totalCount).toBe(4);
    expect(res.isValidCount).toBe(true);
  });

  it("counts overlap between squad and direct picks once", () => {
    const res = getDeduplicatedInvitees(["sq-1"], [ids[2], ids[4]], [squad1], creator);
    expect(res.inviteeIds).toEqual([ids[1], ids[2], ids[4]]);
    expect(res.squadMemberIds).toEqual([ids[1], ids[2]]);
    expect(res.directPersonIds).toEqual([ids[2], ids[4]]);
    expect(res.totalCount).toBe(4);
    expect(res.isValidCount).toBe(true);
  });

  it("prevents submission outside 2-6 person limit (0 invitees or >5 invitees)", () => {
    const emptyRes = getDeduplicatedInvitees([], [], [squad1], creator);
    expect(emptyRes.totalCount).toBe(1);
    expect(emptyRes.isValidCount).toBe(false);

    const sixInvitees = [ids[1], ids[2], ids[3], ids[4], ids[5], "00000000-0000-4000-8000-000000000006"];
    const tooManyRes = getDeduplicatedInvitees([], sixInvitees, [], creator);
    expect(tooManyRes.totalCount).toBe(7);
    expect(tooManyRes.isValidCount).toBe(false);
  });

  it("preselects a squad passed via route param shortcut (#209)", () => {
    const squad = {
      id: "sq-100",
      name: "Apartment 4B",
      members: [
        { id: creator, status: "active" },
        { id: ids[1], status: "active" },
        { id: ids[2], status: "active" },
      ],
    };
    const paramSquadId = "sq-100";
    const res = getDeduplicatedInvitees([paramSquadId], [], [squad], creator);
    expect(res.inviteeIds).toEqual([ids[1], ids[2]]);
    expect(res.totalCount).toBe(3);
    expect(res.isValidCount).toBe(true);
  });
});

describe("getSelectedSquadMembers", () => {
  const creator = ids[0];
  const squad1 = {
    id: "sq-1",
    name: "Roommates",
    members: [
      { id: creator, status: "active" },
      { id: ids[1], status: "active" },
      { id: ids[2], status: "active" },
      { id: ids[3], status: "invited" },
    ],
  };

  it("returns active members excluding creator for selected squads", () => {
    const res = getSelectedSquadMembers(["sq-1"], [squad1], creator);
    expect(res).toHaveLength(1);
    expect(res[0].squad.name).toBe("Roommates");
    expect(res[0].activeMembers.map((m) => m.id)).toEqual([ids[1], ids[2]]);
  });
});
