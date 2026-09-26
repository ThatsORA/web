import { CreateEventRequest } from "@web/contract";
import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { MAX_INVITEES, buildCreateEventRequest, isNoCommonTime, otherWeek, toggleInvitee, weekRange } from "./newHangout";

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

  it("rejects an empty selection", () => {
    expect(() => buildCreateEventRequest({ inviteeIds: [], vibe: null, week: null }, now)).toThrow();
  });
});

describe("isNoCommonTime", () => {
  it("is only the 422 no_common_time error", () => {
    expect(isNoCommonTime(new ApiError(422, { error: "no_common_time" }))).toBe(true);
    expect(isNoCommonTime(new ApiError(400, { error: "invalid_invitees" }))).toBe(false);
    expect(isNoCommonTime(new Error("network"))).toBe(false);
  });
});
