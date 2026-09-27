import { describe, expect, it } from "vitest";
import type { InvitedParticipant } from "./invitations";
import { canDecline, inviteBlock, lateInvitees } from "./lateInvite";

const now = new Date("2026-10-01T12:00:00Z");
const later = (hours: number) => new Date(now.getTime() + hours * 3600_000);
const voting = { status: "voting" as const, isMixer: false, startsAt: later(24), voteClosesAt: later(1) };
const confirmed = { ...voting, status: "confirmed" as const, voteClosesAt: later(-1) };
const me = (over: Partial<InvitedParticipant> = {}): InvitedParticipant =>
  ({ userId: "me", voteStatus: "voted", inviteSource: "squad", sourceGroupIds: ["s"], ...over });

describe("inviteBlock", () => {
  it("lets any participant invite while voting or once confirmed, before the start", () => {
    expect(inviteBlock(voting, me(), now)).toBeNull();
    expect(inviteBlock(confirmed, me({ inviteSource: "direct", voteStatus: "invited" }), now)).toBeNull();
  });

  it("hides the event from outsiders and from a direct invitee who Ghost Passed after close", () => {
    expect(inviteBlock(voting, undefined, now)).toBe("not_found");
    expect(inviteBlock(confirmed, me({ inviteSource: "direct", voteStatus: "ghost_passed" }), now)).toBe("not_found");
  });

  it("closes invites after a pass, on Mixers, once started, and on chatted/expired/completed events", () => {
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

describe("canDecline", () => {
  const direct = me({ inviteSource: "direct", voteStatus: "invited" });
  it("lets a direct invitee who hasn't responded bow out of a confirmed hangout before it starts", () => {
    expect(canDecline(confirmed, direct, now)).toBe(true);
  });
  it("refuses while voting (Ghost Pass instead), after the start, for squad members and people who voted", () => {
    expect(canDecline(voting, direct, now)).toBe(false);
    expect(canDecline({ ...confirmed, startsAt: now }, direct, now)).toBe(false);
    expect(canDecline(confirmed, me({ voteStatus: "invited" }), now)).toBe(false);
    expect(canDecline(confirmed, me({ inviteSource: "direct", voteStatus: "confirmed" }), now)).toBe(false);
    expect(canDecline(confirmed, undefined, now)).toBe(false);
  });
});
