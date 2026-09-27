import { describe, expect, it, vi } from "vitest";
import type { VoteStatus } from "@web/contract";
import { prisma } from "../../lib/prisma";
import { chatAccess, chatAudience, eventAudience, eventParticipants, invitedParticipant, inviteSource, keepsAccess, passKind, viewerScope, type InvitedParticipant, type ParticipantRow } from "./invitations";

vi.mock("../../lib/prisma", () => ({ prisma: { eventParticipant: { findMany: vi.fn() } } }));

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

  it("uses stored provenance for mixed events and falls back safely when a row is missing it", () => {
    const mixed = { createdById: C, sourceGroupId: null, sourceGroupIds: [S1, "squad-2"] };
    expect(inviteSource(mixed, C, { inviteSource: "squad" })).toBe("creator");
    expect(inviteSource(mixed, D, { inviteSource: "direct" })).toBe("direct");
    expect(inviteSource(mixed, S, { inviteSource: "squad" })).toBe("squad");
    expect(inviteSource(mixed, O)).toBe("direct");
  });
});

it("reads stored sources for mixed events and derives sources for legacy events", async () => {
  vi.mocked(prisma.eventParticipant.findMany).mockResolvedValueOnce([
    { userId: S, voteStatus: "invited", inviteSource: "squad", sourceGroupIds: [S1],
      event: { createdById: C, sourceGroupId: null, sourceGroupIds: [S1] } },
    { userId: T, voteStatus: "invited", inviteSource: null, sourceGroupIds: [],
      event: { createdById: null, sourceGroupId: S1, sourceGroupIds: [] } },
  ] as never);
  expect(await eventParticipants("event-1")).toEqual([
    { userId: S, voteStatus: "invited", isMixer: false, inviteSource: "squad", sourceGroupIds: [S1] },
    { userId: T, voteStatus: "invited", isMixer: false, inviteSource: "squad", sourceGroupIds: [S1] },
  ]);
});

it("keeps only committed Mixer invitees after close and opens chat only for committed attendees", () => {
  const mixer = { isMixer: true, createdById: C, sourceGroupId: S1 };
  const invited = rows([C, D, E, O], { [C]: "confirmed", [D]: "voted", [E]: "invited", [O]: "ghost_passed" })
    .map((row) => invitedParticipant(mixer, row));
  expect(invited.map((row) => row.inviteSource)).toEqual(["direct", "direct", "direct", "direct"]);
  expect(eventAudience(invited, true)).toEqual([C, D, E, O]);
  expect(eventAudience(invited, false)).toEqual([C, D]);
  expect(chatAudience("voting", invited)).toEqual([]);
  expect(chatAudience("chatted", invited)).toEqual([C, D]);
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

  it("keeps different selected squads and direct guests private, including an overlapping squad member", () => {
    const mixed = {
      createdById: C, sourceGroupId: null, sourceGroupIds: [S1, "squad-2"],
      participants: [
        { userId: C, voteStatus: "voted" as const, inviteSource: "creator" as const, sourceGroupIds: [] },
        { userId: S, voteStatus: "voted" as const, inviteSource: "squad" as const, sourceGroupIds: [S1] },
        { userId: O, voteStatus: "ghost_passed" as const, inviteSource: "squad" as const, sourceGroupIds: [S1, "squad-2"] },
        { userId: T, voteStatus: "voted" as const, inviteSource: "squad" as const, sourceGroupIds: ["squad-2"] },
        { userId: D, voteStatus: "ghost_passed" as const, inviteSource: "direct" as const, sourceGroupIds: [] },
      ],
    };
    expect(viewerScope(mixed, S).people.map((p) => p.userId)).toEqual([C, S, O]);
    expect(viewerScope(mixed, T).people.map((p) => p.userId)).toEqual([C, O, T]);
    expect(viewerScope(mixed, D).people.map((p) => p.userId)).toEqual([C, D]);
    expect(viewerScope(mixed, C).people.map((p) => p.userId)).toEqual([C, S, O, T, D]);
    expect(viewerScope(mixed, S).people.find((p) => p.userId === O)?.passed).toBe(true);
    expect(viewerScope(mixed, S).people.every((p) => p.userId !== D)).toBe(true);
    expect(viewerScope(mixed, S).attendeeIds).toEqual([C, S]);
  });

  it("refuses a viewer who isn't in the event", () => {
    expect(() => viewerScope(hangout, "stranger")).toThrow("non-participant");
  });
});

describe("keepsAccess / eventAudience (#210)", () => {
  // Squad S1's hangout made by C with members S, O, T; C (creator), S and O passed (visible Passes).
  const squadEvent = { createdById: C, sourceGroupId: S1 };
  const squadRows = rows([C, O, S, T], { [C]: "ghost_passed", [O]: "ghost_passed", [S]: "ghost_passed" })
    .map((r) => ({ ...r, inviteSource: inviteSource(squadEvent, r.userId) }));
  // C's direct hangout with D and E; D ghost passed.
  const directEvent = { createdById: C, sourceGroupId: null };
  const directRows = rows([C, D, E], { [D]: "ghost_passed" })
    .map((r) => ({ ...r, inviteSource: inviteSource(directEvent, r.userId) }));
  const row = (list: typeof directRows, id: string) => list.find((p) => p.userId === id)!;

  it("keeps everyone while voting is open, so a ghost passer can still return and vote", () => {
    expect(eventAudience(directRows, true)).toEqual([C, D, E]);
    expect(keepsAccess(row(directRows, D), true)).toBe(true);
  });

  it("after close, a Ghost Pass is final and loses the event; a visible Pass keeps it", () => {
    expect(keepsAccess(row(directRows, D), false)).toBe(false);
    expect(eventAudience(directRows, false)).toEqual([C, E]);
    expect(keepsAccess(row(squadRows, S), false)).toBe(true);
    expect(keepsAccess(row(squadRows, C), false)).toBe(true);
    expect(eventAudience(squadRows, false)).toEqual([C, O, S, T]);
  });

  it("someone in the event through its squad uses squad rules, even if they'd also have been a direct pick", () => {
    expect(row(squadRows, O).inviteSource).toBe("squad");
    expect(keepsAccess(row(squadRows, O), false)).toBe(true);
  });

  it("a squad Pass is excluded from attendees but stays visible to their squad", () => {
    const scope = viewerScope({ ...squadEvent, participants: squadRows }, T);
    expect(scope.people.find((p) => p.userId === S)?.passed).toBe(true);
    expect(scope.attendeeIds).not.toContain(S);
    expect(scope.attendeeIds).not.toContain(O);
  });
});

describe("chatAudience / chatAccess (#212)", () => {
  const invited = (event: { createdById: string | null; sourceGroupId: string | null }, list: ParticipantRow[]) =>
    list.map((r) => invitedParticipant(event, r));
  // Squad S1's hangout made by C with O, S, T; S passed (a visible Pass).
  const squadRows = invited({ createdById: C, sourceGroupId: S1 }, rows([C, O, S, T], { [S]: "ghost_passed" }));
  // C's direct hangout with D and E; D ghost passed.
  const directRows = invited({ createdById: C, sourceGroupId: null }, rows([C, D, E], { [D]: "ghost_passed" }));
  // A mixed hangout (#207; needs stored provenance, so built by hand): C made it for squad S, T plus D, E directly; E ghost passed.
  const mixedRows: InvitedParticipant[] = [
    { userId: C, voteStatus: "voted", inviteSource: "creator" },
    { userId: S, voteStatus: "voted", inviteSource: "squad", sourceGroupIds: [S1] },
    { userId: T, voteStatus: "ghost_passed", inviteSource: "squad", sourceGroupIds: [S1] },
    { userId: D, voteStatus: "voted", inviteSource: "direct" },
    { userId: E, voteStatus: "ghost_passed", inviteSource: "direct" },
  ];

  it("a squad hangout has chat from creation, through confirmation, and after it ends; squad passers keep it", () => {
    for (const status of ["voting", "confirmed", "chatted", "completed"] as const) {
      expect(chatAudience(status, squadRows)).toEqual([C, O, S, T]);
    }
    const automated = invited({ createdById: null, sourceGroupId: S1 }, rows([O, S, T], { [S]: "ghost_passed" }));
    expect(chatAudience("voting", automated)).toEqual([O, S, T]);
  });

  it("an expired squad hangout has no chat", () => {
    expect(chatAudience("expired", squadRows)).toEqual([]);
  });

  it("direct hangouts have no chat during voting, but grant chat to attending members on confirmed/completed/chatted events", () => {
    for (const status of ["voting", "expired"] as const) {
      expect(chatAudience(status, directRows)).toEqual([]);
    }
    for (const status of ["confirmed", "completed", "chatted"] as const) {
      expect(chatAudience(status, directRows)).toEqual([C, E]);
    }
    const automated = invited({ createdById: null, sourceGroupId: null }, rows([D, E, O], { [D]: "ghost_passed" }));
    expect(chatAudience("chatted", automated)).toEqual([E, O]);
    expect(chatAudience("confirmed", automated)).toEqual([E, O]);
  });

  it("keeps direct invitees out of mixed chat during voting, but includes attending direct invitees once confirmed", () => {
    expect(chatAudience("voting", mixedRows)).toEqual([C, S, T]);
    for (const status of ["confirmed", "chatted", "completed"] as const) {
      expect(chatAudience(status, mixedRows)).toEqual([C, S, T, D]);
    }
  });

  it("mixer events have no chat during voting, but grant chat to confirmed attendees post-close", () => {
    const mixerRows: InvitedParticipant[] = [
      { userId: "m1", voteStatus: "confirmed", isMixer: true, inviteSource: "direct" },
      { userId: "m2", voteStatus: "voted", isMixer: true, inviteSource: "direct" },
      { userId: "m3", voteStatus: "ghost_passed", isMixer: true, inviteSource: "direct" },
      { userId: "m4", voteStatus: "invited", isMixer: true, inviteSource: "direct" },
    ];
    for (const status of ["voting", "expired"] as const) {
      expect(chatAudience(status, mixerRows)).toEqual([]);
    }
    for (const status of ["confirmed", "completed", "chatted"] as const) {
      expect(chatAudience(status, mixerRows)).toEqual(["m1", "m2"]);
    }
  });

  it("does not open one chat across squads whose members cannot all see each other", () => {
    const separateSquads: InvitedParticipant[] = [
      { userId: C, voteStatus: "voted", inviteSource: "creator", sourceGroupIds: [] },
      { userId: S, voteStatus: "voted", inviteSource: "squad", sourceGroupIds: [S1] },
      { userId: T, voteStatus: "voted", inviteSource: "squad", sourceGroupIds: ["squad-2"] },
    ];
    expect(chatAudience("voting", separateSquads)).toEqual([]);
    expect(chatAudience("chatted", separateSquads)).toEqual([]);
  });

  it("only ever holds people who may all see each other (viewerScope), so no poster is someone a member may not see", () => {
    const members = chatAudience("voting", mixedRows);
    const withCreator = { createdById: C, sourceGroupId: S1 }; // derived sources match the hand-built ones for C, S, T
    for (const viewer of members) {
      const seen = viewerScope({ ...withCreator, participants: mixedRows.filter((r) => members.includes(r.userId)) }, viewer);
      expect(seen.people.map((p) => p.userId)).toEqual(members);
    }
  });

  it("is open until ends_at, then read-only, and null for anyone outside the chat", () => {
    const endsAt = new Date("2026-10-01T20:30:00Z");
    const before = new Date("2026-10-01T20:29:59Z");
    expect(chatAccess({ status: "voting", endsAt }, squadRows, S, before)).toBe("open");
    expect(chatAccess({ status: "confirmed", endsAt }, squadRows, O, before)).toBe("open");
    expect(chatAccess({ status: "completed", endsAt }, squadRows, O, endsAt)).toBe("read_only");
    expect(chatAccess({ status: "confirmed", endsAt }, directRows, E, before)).toBe("open");
    expect(chatAccess({ status: "confirmed", endsAt }, directRows, E, endsAt)).toBe("read_only");
    expect(chatAccess({ status: "confirmed", endsAt }, directRows, D, before)).toBeNull(); // Ghost Pass
    expect(chatAccess({ status: "chatted", endsAt }, directRows, E, endsAt)).toBe("read_only");
    expect(chatAccess({ status: "chatted", endsAt }, directRows, D, before)).toBeNull(); // Ghost Pass
    expect(chatAccess({ status: "voting", endsAt }, mixedRows, D, before)).toBeNull(); // direct invitee in a squad chat during voting
    expect(chatAccess({ status: "confirmed", endsAt }, mixedRows, D, before)).toBe("open"); // direct invitee in confirmed mixed chat
    expect(chatAccess({ status: "voting", endsAt }, directRows, E, before)).toBeNull(); // no chat yet during voting
    expect(chatAccess({ status: "voting", endsAt }, squadRows, "stranger", before)).toBeNull();

    const mixerRows: InvitedParticipant[] = [
      { userId: "m1", voteStatus: "confirmed", isMixer: true, inviteSource: "direct" },
      { userId: "m3", voteStatus: "ghost_passed", isMixer: true, inviteSource: "direct" },
    ];
    expect(chatAccess({ status: "confirmed", endsAt }, mixerRows, "m1", before)).toBe("open");
    expect(chatAccess({ status: "confirmed", endsAt }, mixerRows, "m1", endsAt)).toBe("read_only");
    expect(chatAccess({ status: "confirmed", endsAt }, mixerRows, "m3", before)).toBeNull();
  });

  it("grants open chat access during voting and confirmation on squad hangouts so members can discuss plans and nominate new invitees", () => {
    const endsAt = new Date(Date.now() + 3600_000);
    const now = new Date();
    expect(chatAccess({ status: "voting", endsAt }, squadRows, S, now)).toBe("open");
    expect(chatAccess({ status: "confirmed", endsAt }, squadRows, O, now)).toBe("open");
  });
});
