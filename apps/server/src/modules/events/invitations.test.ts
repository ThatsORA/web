import { describe, expect, it } from "vitest";
import type { VoteStatus } from "@web/contract";
import { inviteSource, passKind, viewerScope, type ParticipantRow } from "./invitations";

const [C, D, E, O, S, T] = ["c", "d", "e", "o", "s", "t"];
const S1 = "squad-1";

const rows = (ids: string[], statuses: Record<string, VoteStatus> = {}): ParticipantRow[] =>
  ids.map((userId) => ({ userId, voteStatus: statuses[userId] ?? "voted" }));

describe("inviteSource", () => {
  it("derives the source from the event: creator, then the event's squad, else direct", () => {
    expect(inviteSource({ createdById: C, sourceGroupId: null }, C)).toBe("creator");
    expect(inviteSource({ createdById: C, sourceGroupId: null }, D)).toBe("direct");
    expect(inviteSource({ createdById: null, sourceGroupId: null }, D)).toBe("direct");
    expect(inviteSource({ createdById: null, sourceGroupId: S1 }, S)).toBe("squad");
  });
});

describe("passKind", () => {
  it("is a Ghost Pass only for direct invites", () => {
    expect([passKind("direct"), passKind("squad"), passKind("creator")]).toEqual(["ghost", "visible", "visible"]);
  });
});

describe("viewerScope", () => {
  // C made a hangout and invited D and E directly; D ghost passed.
  const hangout = { createdById: C, sourceGroupId: null, participants: rows([C, D, E], { [D]: "ghost_passed" }) };

  it("creator: sees everyone and who attended, but never a ghost pass marker", () => {
    const scope = viewerScope(hangout, C);
    expect(scope.viewer).toEqual({ invite_source: "creator", pass_kind: "visible", full_roster: true });
    expect(scope.people.map((p) => [p.userId, p.inviteSource, p.passed])).toEqual([
      [C, "creator", false], [D, "direct", null], [E, "direct", null],
    ]);
    expect(scope.attendeeIds).toEqual([C, E]); // D's absence is only inferable here
    expect(scope.seesEveryone).toBe(true);
  });

  it("direct invitee: sees only themselves and the creator, whoever passed", () => {
    for (const viewer of [D, E]) {
      const scope = viewerScope(hangout, viewer);
      expect(scope.viewer).toEqual({ invite_source: "direct", pass_kind: "ghost", full_roster: false });
      expect(scope.people.map((p) => p.userId)).toEqual([C, viewer]);
      expect(scope.seesEveryone).toBe(false);
    }
    expect(viewerScope(hangout, D).people.find((p) => p.userId === D)?.passed).toBe(true); // your own pass is yours to see
    expect(viewerScope(hangout, E).attendeeIds).toEqual([C, E]);
  });

  it("a direct invitee's ghost pass looks exactly like a vote to every other guest", () => {
    const voted = { ...hangout, participants: rows([C, D, E]) };
    expect(viewerScope(hangout, E)).toEqual(viewerScope(voted, E));
  });

  it("automated close-friend hangout: no creator view; each person sees only themselves", () => {
    const automated = { createdById: null, sourceGroupId: null, participants: rows([D, E, O], { [D]: "ghost_passed" }) };
    for (const viewer of [D, E, O]) {
      const scope = viewerScope(automated, viewer);
      expect(scope.viewer.full_roster).toBe(false);
      expect(scope.people.map((p) => p.userId)).toEqual([viewer]);
    }
  });

  it("automated squad hangout: every member sees every member and their visible pass", () => {
    const squad = { createdById: null, sourceGroupId: S1, participants: rows([O, S, T], { [S]: "ghost_passed" }) };
    const scope = viewerScope(squad, O);
    expect(scope.viewer).toEqual({ invite_source: "squad", pass_kind: "visible", full_roster: false });
    expect(scope.people.map((p) => [p.userId, p.passed])).toEqual([[O, false], [S, true], [T, false]]);
    expect(scope.seesEveryone).toBe(true);
  });

  it("refuses a viewer who isn't in the event", () => {
    expect(() => viewerScope(hangout, "stranger")).toThrow("non-participant");
  });
});
