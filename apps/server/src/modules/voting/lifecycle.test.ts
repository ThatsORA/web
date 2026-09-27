import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  participantFindMany: vi.fn(),
  findUnique: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  $transaction: vi.fn(),
  emitToUsers: vi.fn(),
  pushEventCreated: vi.fn(),
  pushEventResolved: vi.fn(),
}));
vi.mock("../../lib/prisma", () => ({
  prisma: {
    event: {
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
      findUniqueOrThrow: mocks.findUniqueOrThrow,
      update: mocks.update,
      updateMany: mocks.updateMany,
    },
    eventParticipant: { findMany: mocks.participantFindMany },
    $transaction: mocks.$transaction,
  },
}));
vi.mock("../../realtime", () => ({
  emitToUsers: mocks.emitToUsers,
  pushEventCreated: mocks.pushEventCreated,
  pushEventResolved: mocks.pushEventResolved,
}));
import { afterResponse, closeVoting, openVoting, sweepVoting } from "./lifecycle";

// Participant rows as eventParticipants() reads them: invite source comes from the event (#206).
const inEvent = (event: { createdById: string | null; sourceGroupId: string | null }, rows: { userId: string; voteStatus: string }[]) =>
  rows.map((row) => ({ ...row, event }));

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("sweepVoting", () => {
  it("starts all due closes together, isolates failures, then completes ended events", async () => {
    const now = new Date("2026-09-26T12:00:00Z");
    const error = new Error("one close failed");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    let release!: (value: null) => void;
    const pending = new Promise<null>((resolve) => { release = resolve; });
    mocks.findMany
      .mockResolvedValueOnce([{ id: "slow" }, { id: "failed" }, { id: "ready" }])
      .mockResolvedValueOnce([{ id: "ended" }]);
    // The ghost passer of a finished event gets nothing (#210).
    mocks.participantFindMany.mockResolvedValueOnce(inEvent({ createdById: "user", sourceGroupId: null }, [
      { userId: "user", voteStatus: "confirmed" },
      { userId: "friend", voteStatus: "confirmed" },
      { userId: "ghost", voteStatus: "ghost_passed" },
    ]));
    mocks.findUnique.mockReturnValueOnce(pending).mockRejectedValueOnce(error).mockResolvedValueOnce(null);
    mocks.updateMany.mockResolvedValue({ count: 1 });

    const sweep = sweepVoting(now);
    await Promise.resolve();
    expect(mocks.findUnique.mock.calls.map(([query]) => query.where.id)).toEqual(["slow", "failed", "ready"]);
    expect(mocks.findMany).toHaveBeenCalledTimes(1);

    release(null);
    await expect(sweep).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("closeVoting", "failed", error);
    expect(mocks.findMany).toHaveBeenLastCalledWith({
      where: { status: "confirmed", endsAt: { lte: now } },
      select: { id: true },
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "ended", status: "confirmed" }, data: { status: "completed" },
    });
    expect(mocks.participantFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { eventId: "ended" } }));
    expect(mocks.emitToUsers).toHaveBeenCalledWith(["user", "friend"], "event:resolved", { event_id: "ended", status: "completed" });
  });
});

describe("openVoting", () => {
  it("emits event:created and pushes pushEventCreated with event details", async () => {
    const startsAt = new Date("2026-10-01T22:30:00Z");
    const createdAt = new Date("2026-09-26T12:00:00Z");
    mocks.findUniqueOrThrow.mockResolvedValueOnce({
      id: "evt-1",
      createdAt,
      startsAt,
      vibeTag: "dinner",
      timezone: "America/New_York",
      participants: [{ userId: "u1" }, { userId: "u2" }],
    });
    mocks.update.mockResolvedValueOnce({});
    mocks.pushEventCreated.mockResolvedValueOnce(undefined);

    await openVoting("evt-1");

    expect(mocks.emitToUsers).toHaveBeenCalledWith(["u1", "u2"], "event:created", { event_id: "evt-1" });
    expect(mocks.pushEventCreated).toHaveBeenCalledWith(
      ["u1", "u2"],
      "evt-1",
      {
        startsAt,
        vibeTag: "dinner",
        timezone: "America/New_York",
      },
    );
  });
});

describe("closeVoting", () => {
  it("pushes pushEventResolved when status is confirmed", async () => {
    const u1 = "77777777-7777-4777-8777-777777777777";
    const u2 = "11111111-1111-4111-8111-111111111111";
    const opt1 = "88888888-8888-4888-8888-888888888888";
    const evt1 = "99999999-9999-4999-8999-999999999999";
    mocks.participantFindMany.mockResolvedValueOnce(inEvent({ createdById: u1, sourceGroupId: null }, [
      { userId: u1, voteStatus: "voted" },
      { userId: u2, voteStatus: "voted" },
    ]));
    mocks.findUnique.mockResolvedValueOnce({
      id: evt1,
      status: "voting",
      options: [
        {
          id: opt1,
          rank: 1,
          placeId: "p1",
          name: "Sergio's",
          lat: 25.7,
          lng: -80.3,
          primaryType: "restaurant",
          priceLevel: 2,
          rating: 4.5,
          userRatingCount: 100,
          travelMinutes: { [u1]: 10, [u2]: 15 },
          maxTravelMin: 15,
          routeScore: 10,
          factsLine: "facts",
          aiBlurb: null,
        },
      ],
      votes: [
        { userId: u1, optionId: opt1 },
        { userId: u2, optionId: opt1 },
      ],
      backupVenues: [],
    });
    mocks.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) =>
      cb({
        event: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        eventParticipant: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }),
    );
    mocks.pushEventResolved.mockResolvedValueOnce(undefined);

    await closeVoting(evt1);

    expect(mocks.emitToUsers).toHaveBeenCalledWith([u1, u2], "event:resolved", {
      event_id: evt1,
      status: "confirmed",
    });
    expect(mocks.pushEventResolved).toHaveBeenCalledWith([u1, u2], evt1, "confirmed");
  });
});

describe("pass lifecycle (#210)", () => {
  const [creator, direct, ghost, squad] = [
    "77777777-7777-4777-8777-777777777777",
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
  ];
  const opt = "88888888-8888-4888-8888-888888888888";
  const evt = "99999999-9999-4999-8999-999999999999";
  const option = {
    id: opt, rank: 1, placeId: "p1", name: "Sergio's", lat: 25.7, lng: -80.3, primaryType: "restaurant",
    priceLevel: 2, rating: 4.5, userRatingCount: 100, travelMinutes: {}, maxTravelMin: 15, routeScore: 10,
    factsLine: "facts", aiBlurb: null,
  };
  // C's direct hangout: C and D voted, G ghost passed. Everyone has responded.
  const directRows = inEvent({ createdById: creator, sourceGroupId: null }, [
    { userId: creator, voteStatus: "voted" },
    { userId: direct, voteStatus: "voted" },
    { userId: ghost, voteStatus: "ghost_passed" },
  ]);
  // C's squad hangout: C and D (squad) voted, S (squad) passed visibly.
  const squadRows = inEvent({ createdById: creator, sourceGroupId: "s1" }, [
    { userId: creator, voteStatus: "voted" },
    { userId: direct, voteStatus: "voted" },
    { userId: squad, voteStatus: "ghost_passed" },
  ]);
  const closing = () => {
    mocks.findUnique.mockResolvedValueOnce({
      id: evt, status: "voting", options: [option],
      votes: [{ userId: creator, optionId: opt }, { userId: direct, optionId: opt }], backupVenues: [],
    });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    mocks.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) =>
      cb({ event: { updateMany }, eventParticipant: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) } }));
    mocks.pushEventResolved.mockResolvedValueOnce(undefined);
    return updateMany;
  };

  it("closes early once everyone has responded, counting a Ghost Pass, then drops the ghost passer from updates", async () => {
    mocks.participantFindMany.mockResolvedValue(directRows);
    const updateMany = closing();

    await afterResponse(evt);

    // Progress goes to everyone and a pass looks like a vote.
    expect(mocks.emitToUsers).toHaveBeenNthCalledWith(1, [creator, direct, ghost], "event:progress", { event_id: evt, responded: 3, total: 3 });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "confirmed" }) }));
    // After close: the ghost passer stops getting the event.
    expect(mocks.emitToUsers).toHaveBeenNthCalledWith(2, [creator, direct], "event:resolved", { event_id: evt, status: "confirmed" });
    expect(mocks.pushEventResolved).toHaveBeenCalledWith([creator, direct], evt, "confirmed");
  });

  it("closes early counting a squad Pass, and the squad passer (visible Pass) keeps getting updates", async () => {
    mocks.participantFindMany.mockResolvedValue(squadRows);
    closing();

    await afterResponse(evt);

    expect(mocks.emitToUsers).toHaveBeenNthCalledWith(1, [creator, direct, squad], "event:progress", { event_id: evt, responded: 3, total: 3 });
    expect(mocks.emitToUsers).toHaveBeenNthCalledWith(2, [creator, direct, squad], "event:resolved", { event_id: evt, status: "confirmed" });
    expect(mocks.pushEventResolved).toHaveBeenCalledWith([creator, direct, squad], evt, "confirmed");
  });

  it("stays open while someone hasn't responded, so a ghost passer can still return", async () => {
    mocks.participantFindMany.mockResolvedValue([directRows[0]!, { ...directRows[1]!, voteStatus: "invited" }, directRows[2]!]);
    await afterResponse(evt);
    expect(mocks.emitToUsers).toHaveBeenCalledOnce();
    expect(mocks.emitToUsers).toHaveBeenCalledWith([creator, direct, ghost], "event:progress", { event_id: evt, responded: 2, total: 3 });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
