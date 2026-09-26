import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  participantUpdateMany: vi.fn(),
  transaction: vi.fn(),
  emitToUsers: vi.fn(),
  pushEventCreated: vi.fn(),
  pushEventConfirmed: vi.fn(),
}));
vi.mock("../../lib/prisma", () => ({
  prisma: {
    event: { findMany: mocks.findMany, findUnique: mocks.findUnique, findUniqueOrThrow: mocks.findUnique, update: mocks.update, updateMany: mocks.updateMany },
    eventParticipant: { updateMany: mocks.participantUpdateMany },
    $transaction: mocks.transaction,
  },
}));
vi.mock("../../realtime", () => ({ emitToUsers: mocks.emitToUsers }));
vi.mock("../../realtime/push", () => ({
  pushEventCreated: mocks.pushEventCreated,
  pushEventConfirmed: mocks.pushEventConfirmed,
}));
import { closeVoting, openVoting, sweepVoting } from "./lifecycle";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.pushEventCreated.mockResolvedValue(undefined);
  mocks.pushEventConfirmed.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation((callback) => callback({
    event: { updateMany: mocks.updateMany },
    eventParticipant: { updateMany: mocks.participantUpdateMany },
  }));
});
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

describe("push lifecycle", () => {
  const baseEvent = {
    id: "2b5232d3-9424-4e7c-8e2f-0299693b54eb",
    status: "voting",
    createdAt: new Date("2026-09-26T12:00:00Z"),
    startsAt: new Date("2026-10-01T22:30:00Z"),
    timezone: "America/New_York",
    vibeTag: "dinner",
    backupVenues: [],
    participants: [
      { userId: "user-1", voteStatus: "voted" },
      { userId: "user-2", voteStatus: "voted" },
    ],
    options: [
      {
        id: "21de1e6b-dd91-4c3b-9d8d-09967699e354", rank: 1, placeId: "place-1", name: "Dinner", lat: 0, lng: 0,
        primaryType: "restaurant", priceLevel: 2, rating: 4.5, userRatingCount: 50,
        travelMinutes: {}, maxTravelMin: 10, routeScore: 11, factsLine: "", aiBlurb: null,
      },
    ],
    votes: [
      { userId: "user-1", optionId: "21de1e6b-dd91-4c3b-9d8d-09967699e354" },
      { userId: "user-2", optionId: "21de1e6b-dd91-4c3b-9d8d-09967699e354" },
    ],
  } as const;

  it("keeps openVoting successful when detached push delivery rejects", async () => {
    const error = new Error("provider unavailable");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.findUnique.mockResolvedValue(baseEvent);
    mocks.pushEventCreated.mockRejectedValue(error);

    await expect(openVoting(baseEvent.id)).resolves.toBeUndefined();
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith("push event:created", baseEvent.id, error));
    expect(mocks.emitToUsers).toHaveBeenCalledWith(["user-1", "user-2"], "event:created", { event_id: baseEvent.id });
  });

  it("pushes event:resolved only for a claimed confirmed resolution", async () => {
    mocks.findUnique.mockResolvedValue(baseEvent);
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await closeVoting(baseEvent.id);

    expect(mocks.emitToUsers).toHaveBeenCalledWith(
      ["user-1", "user-2"], "event:resolved", { event_id: baseEvent.id, status: "confirmed" },
    );
    expect(mocks.pushEventConfirmed).toHaveBeenCalledWith(["user-1", "user-2"], baseEvent.id);
  });

  it.each([
    { status: "chatted", participants: baseEvent.participants, votes: [baseEvent.votes[0]] },
    { status: "expired", participants: [{ ...baseEvent.participants[0], voteStatus: "voted" }, { ...baseEvent.participants[1], voteStatus: "ghost_passed" }], votes: [baseEvent.votes[0]] },
  ] as const)("does not push a $status resolution", async ({ status, participants, votes }) => {
    mocks.findUnique.mockResolvedValue({ ...baseEvent, participants, votes });
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await closeVoting(baseEvent.id);

    expect(mocks.emitToUsers).toHaveBeenCalledWith(
      ["user-1", "user-2"], "event:resolved", { event_id: baseEvent.id, status },
    );
    expect(mocks.pushEventConfirmed).not.toHaveBeenCalled();
  });
});
