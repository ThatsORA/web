import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { z } from "zod";
import { buildCreateEventRequest, getDeduplicatedInvitees, getSelectedSquadMembers, newHangoutErrorMessage, noMatchReason, otherWeek, weekRange } from "./newHangout";

const ids = Array.from({ length: 6 }, (_, i) => `00000000-0000-4000-8000-00000000000${i}`);

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

describe("newHangoutErrorMessage", () => {
  const response = (status: number, error: string) => newHangoutErrorMessage(new ApiError(status, { error }));

  it("explains an existing hangout and where to find it", () => {
    expect(response(409, "already_open")).toMatch(/already open.*Hangouts/);
  });

  it("explains invalid invitees, squads, and selections", () => {
    expect(response(400, "invalid_invitees")).toMatch(/invitees.*Update who’s coming/);
    expect(response(400, "invalid_squads")).toMatch(/squad.*Update who’s coming/);
    expect(response(400, "invalid_selection")).toMatch(/at least one other person/);
  });

  it("distinguishes an expired session from server and network failures", () => {
    expect(response(401, "unauthorized")).toMatch(/session expired/);
    expect(response(500, "internal_error")).toMatch(/server.*Check Hangouts/);
    expect(newHangoutErrorMessage(new TypeError("Network request failed"))).toMatch(/Couldn't confirm.*Check Hangouts/);
  });

  it("warns that a failed client parse may follow successful creation", () => {
    const parsed = z.object({ id: z.string() }).safeParse({ id: 42 });
    if (parsed.success) throw new Error("Expected a validation error");
    expect(newHangoutErrorMessage(parsed.error)).toMatch(/may have started.*Check Hangouts/);
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
    expect(res.canSubmit).toBe(true);
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
    expect(res.canSubmit).toBe(true);
  });

  it("counts overlap between squad and direct picks once", () => {
    const res = getDeduplicatedInvitees(["sq-1"], [ids[2], ids[4]], [squad1], creator);
    expect(res.inviteeIds).toEqual([ids[1], ids[2], ids[4]]);
    expect(res.squadMemberIds).toEqual([ids[1], ids[2]]);
    expect(res.canSubmit).toBe(true);
  });

  it("needs at least one person, with no upper limit (#363)", () => {
    expect(getDeduplicatedInvitees([], [], [squad1], creator).canSubmit).toBe(false);
    expect(getDeduplicatedInvitees([], [creator], [], creator).canSubmit).toBe(false);
    const many = getDeduplicatedInvitees([], [...ids.slice(1), "00000000-0000-4000-8000-000000000006"], [], creator);
    expect(many.inviteeIds).toHaveLength(6);
    expect(many.canSubmit).toBe(true);
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
    expect(res.canSubmit).toBe(true);
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
