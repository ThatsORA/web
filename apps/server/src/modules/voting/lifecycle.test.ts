import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
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
    $transaction: mocks.$transaction,
  },
}));
vi.mock("../../realtime", () => ({
  emitToUsers: mocks.emitToUsers,
  pushEventCreated: mocks.pushEventCreated,
  pushEventResolved: mocks.pushEventResolved,
}));
import { closeVoting, openVoting, sweepVoting } from "./lifecycle";

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
      .mockResolvedValueOnce([{ id: "ended", participants: [{ userId: "user" }] }]);
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
      include: { participants: { select: { userId: true } } },
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "ended", status: "confirmed" }, data: { status: "completed" },
    });
    expect(mocks.emitToUsers).toHaveBeenCalledWith(["user"], "event:resolved", { event_id: "ended", status: "completed" });
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
    mocks.findUnique.mockResolvedValueOnce({
      id: evt1,
      status: "voting",
      participants: [
        { userId: u1, voteStatus: "voted" },
        { userId: u2, voteStatus: "voted" },
      ],
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

