import { describe, expect, it } from "vitest";
import type { VoteStatus } from "@web/contract";
import { passKind, resolveInvites, viewerScope, type InviteRow, type ParticipantRow } from "./invitations";

// Creator C picks squad S1 {C, S, O} and squad S2 {C, T}, plus D and E directly. O is also picked
// directly and T is in both squads, so each appears once with squad rules.
const [C, S, O, T, D, E] = ["c", "s", "o", "t", "d", "e"];
const S1 = "squad-1";
const S2 = "squad-2";

const mixed = resolveInvites({
  creatorId: C,
  directIds: [D, E, O],
  squads: [{ id: S1, memberIds: [C, S, O, T] }, { id: S2, memberIds: [C, T] }],
});

const withStatus = (rows: InviteRow[], statuses: Record<string, VoteStatus> = {}): ParticipantRow[] =>
  rows.map((row) => ({ ...row, voteStatus: statuses[row.userId] ?? "voted" }));

describe("resolveInvites", () => {
  it("lists each person once; squad wins over a direct pick or being the creator, and keeps every squad", () => {
    expect(mixed).toEqual([
      { userId: C, inviteSource: "squad", squadIds: [S1, S2] },
      { userId: D, inviteSource: "direct", squadIds: [] },
      { userId: E, inviteSource: "direct", squadIds: [] },
      { userId: O, inviteSource: "squad", squadIds: [S1] },
      { userId: S, inviteSource: "squad", squadIds: [S1] },
      { userId: T, inviteSource: "squad", squadIds: [S1, S2] },
    ]);
  });

  it("marks the creator of a direct-only hangout as the creator, and an automated one has none", () => {
    expect(resolveInvites({ creatorId: C, directIds: [D, C] })).toEqual([
      { userId: C, inviteSource: "creator", squadIds: [] },
      { userId: D, inviteSource: "direct", squadIds: [] },
    ]);
    expect(resolveInvites({ creatorId: null, directIds: [D, E] }).map((r) => r.inviteSource)).toEqual(["direct", "direct"]);
  });
});

describe("passKind", () => {
  it("is a Ghost Pass only for direct invites", () => {
    expect([passKind("direct"), passKind("squad"), passKind("creator")]).toEqual(["ghost", "visible", "visible"]);
  });
});

describe("viewerScope", () => {
  // In the mixed event, D ghost passed and S passed visibly.
  const event = { createdById: C, participants: withStatus(mixed, { [D]: "ghost_passed", [S]: "ghost_passed" }) };
  const ids = (viewerId: string) => viewerScope(event, viewerId).people.map((p) => p.userId);

  it("creator: sees everyone and who attended, but never a ghost pass marker", () => {
    const scope = viewerScope(event, C);
    expect(scope.viewer).toEqual({ invite_source: "squad", pass_kind: "visible", full_roster: true });
    expect(scope.people.map((p) => [p.userId, p.passed])).toEqual([
      [C, false], [D, null], [E, null], [O, false], [S, true], [T, false],
    ]);
    expect(scope.attendeeIds).toEqual([C, E, O, T]); // D's absence is only inferable here
    expect(scope.seesEveryone).toBe(true);
  });

  it("squad member: sees their squad and its visible passes, never the direct invitees", () => {
    const scope = viewerScope(event, O);
    expect(scope.viewer).toEqual({ invite_source: "squad", pass_kind: "visible", full_roster: false });
    expect(scope.people.map((p) => [p.userId, p.passed])).toEqual([[C, false], [O, false], [S, true], [T, false]]);
    expect(scope.attendeeIds).toEqual([C, O, T]);
    expect(scope.seesEveryone).toBe(false);
  });

  it("squad member of one selected squad doesn't see a squad they didn't come in with", () => {
    const twoSquads = resolveInvites({ creatorId: C, squads: [{ id: S1, memberIds: [C, S] }, { id: S2, memberIds: [C, T] }] });
    expect(viewerScope({ createdById: C, participants: withStatus(twoSquads) }, S).people.map((p) => p.userId)).toEqual([C, S]);
  });

  it("direct invitee: sees only themselves and the creator, whoever passed", () => {
    for (const viewer of [D, E]) {
      const scope = viewerScope(event, viewer);
      expect(scope.viewer).toEqual({ invite_source: "direct", pass_kind: "ghost", full_roster: false });
      expect(ids(viewer)).toEqual([C, viewer].sort());
      expect(scope.seesEveryone).toBe(false);
    }
    expect(viewerScope(event, D).people.find((p) => p.userId === D)?.passed).toBe(true); // your own pass is yours to see
    expect(viewerScope(event, E).attendeeIds).toEqual([C, E]);
  });

  it("mixed event: a direct invitee's ghost pass looks exactly like a vote to every other guest", () => {
    const voted = { createdById: C, participants: withStatus(mixed) };
    const ghosted = { createdById: C, participants: withStatus(mixed, { [D]: "ghost_passed" }) };
    for (const viewer of [E, O, S, T]) expect(viewerScope(ghosted, viewer)).toEqual(viewerScope(voted, viewer));
  });

  it("automated hangout: no creator view; direct invitees see only themselves", () => {
    const automated = { createdById: null, participants: withStatus(resolveInvites({ creatorId: null, directIds: [D, E, O] }), { [D]: "ghost_passed" }) };
    for (const viewer of [D, E, O]) {
      const scope = viewerScope(automated, viewer);
      expect(scope.viewer.full_roster).toBe(false);
      expect(scope.people.map((p) => p.userId)).toEqual([viewer]);
    }
  });

  it("automated squad hangout: every member sees every member and their visible pass", () => {
    const squad = { createdById: null, participants: withStatus(resolveInvites({ creatorId: null, squads: [{ id: S1, memberIds: [S, O, T] }] }), { [S]: "ghost_passed" }) };
    const scope = viewerScope(squad, O);
    expect(scope.viewer).toEqual({ invite_source: "squad", pass_kind: "visible", full_roster: false });
    expect(scope.people.map((p) => [p.userId, p.passed])).toEqual([[O, false], [S, true], [T, false]]);
    expect(scope.seesEveryone).toBe(true);
  });

  it("refuses a viewer who isn't in the event", () => {
    expect(() => viewerScope(event, "stranger")).toThrow("non-participant");
  });
});
