import { describe, expect, it } from "vitest";
import type { InvitedParticipant } from "./invitations";
import { canAnswerInvite, inviteBlock, lateInvitees } from "./lateInvite";

const now = new Date("2026-10-01T12:00:00Z");
const later = (hours: number) => new Date(now.getTime() + hours * 3600_000);
const voting = { status: "voting" as const, isMixer: false, startsAt: later(24), voteClosesAt: later(1) };
const confirmed = { ...voting, status: "confirmed" as const, voteClosesAt: later(-1) };
const me = (over: Partial<InvitedParticipant> = {}): InvitedParticipant =>
  ({ userId: "me", voteStatus: "voted", inviteSource: "squad", sourceGroupIds: ["s"], ...over });

describe("inviteBlock", () => {
  it("lets any participant invite once confirmed before the start, but closes invites during voting", () => {
    expect(inviteBlock(voting, me(), now)).toBe("closed");
    expect(inviteBlock(confirmed, me({ inviteSource: "direct", voteStatus: "invited" }), now)).toBeNull();
  });

  it("hides the event from outsiders and from a direct invitee who Ghost Passed after close", () => {
    expect(inviteBlock(voting, undefined, now)).toBe("not_found");
    expect(inviteBlock(confirmed, me({ inviteSource: "direct", voteStatus: "ghost_passed" }), now)).toBe("not_found");
  });

  it("closes invites during voting, after a pass, on Mixers, once started, and on chatted/expired/completed events", () => {
    expect(inviteBlock(voting, me(), now)).toBe("closed");
    expect(inviteBlock(voting, me({ voteStatus: "ghost_passed" }), now)).toBe("closed");
    expect(inviteBlock({ ...voting, isMixer: true }, me(), now)).toBe("closed");
    expect(inviteBlock({ ...confirmed, startsAt: now }, me(), now)).toBe("closed");
    for (const status of ["chatted", "expired", "completed"] as const) {
      expect(inviteBlock({ ...confirmed, status }, me(), now)).toBe("closed");
    }
  });
});

describe("lateInvitees", () => {
  const row = (a: string, b: string, status = "accepted") => ({ userLowId: a < b ? a : b, userHighId: a < b ? b : a, status });

  it("keeps accepted friends not already in the event, deduplicated", () => {
    expect(lateInvitees("me", ["x", "y", "x"], [row("me", "x"), row("y", "me")], ["me"])).toEqual(["x", "y"]);
  });

  it("silently skips anyone already in the event, even someone the inviter can't see", () => {
    expect(lateInvitees("me", ["x"], [row("me", "x")], ["me", "x"])).toEqual([]);
  });

  it("rejects the whole request if anyone isn't an accepted friend", () => {
    expect(lateInvitees("me", ["x", "z"], [row("me", "x")], ["me"])).toEqual({ error: "invalid_invitees" });
    expect(lateInvitees("me", ["x"], [row("me", "x", "pending")], ["me"])).toEqual({ error: "invalid_invitees" });
    expect(lateInvitees("me", ["x"], [row("q", "x")], ["me"])).toEqual({ error: "invalid_invitees" });
  });
});

describe("canAnswerInvite (#345, #407)", () => {
  const late = me({ inviteSource: "direct", voteStatus: "invited", sourceGroupIds: ["invited_by:host"] });
  it("lets a late invitee who hasn't answered say I'm in or Can't make it before the hangout starts", () => {
    expect(canAnswerInvite(confirmed, late, now)).toBe(true);
  });
  it("refuses original non-voters, while voting, after the start, once answered, and for outsiders", () => {
    expect(canAnswerInvite(confirmed, me({ inviteSource: "direct", voteStatus: "invited", sourceGroupIds: [] }), now)).toBe(false);
    expect(canAnswerInvite(voting, late, now)).toBe(false);
    expect(canAnswerInvite({ ...confirmed, startsAt: now }, late, now)).toBe(false);
    expect(canAnswerInvite(confirmed, { ...late, voteStatus: "confirmed" }, now)).toBe(false);
    expect(canAnswerInvite(confirmed, undefined, now)).toBe(false);
  });
});
