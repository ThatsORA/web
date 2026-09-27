import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RankedVenue } from "@web/contract";

const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  friendshipFindMany: vi.fn(),
  explicitGroupFindMany: vi.fn(),
  eventFindMany: vi.fn(),
  eventFindFirst: vi.fn(),
  eventCreate: vi.fn(),
  transaction: vi.fn(),
  curateVenues: vi.fn(),
  fetchCandidates: vi.fn(),
  openVoting: vi.fn(),
  askDecision: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    user: { findMany: mocks.userFindMany },
    friendship: { findMany: mocks.friendshipFindMany },
    explicitGroup: { findMany: mocks.explicitGroupFindMany },
    event: { findMany: mocks.eventFindMany },
    $transaction: mocks.transaction,
  },
}));
vi.mock("../intelligence/curateVenues", async (importOriginal) => ({
  ...await importOriginal<typeof import("../intelligence/curateVenues")>(),
  curateVenues: mocks.curateVenues,
}));
vi.mock("../intelligence/decision", async (importOriginal) => ({
  ...await importOriginal<typeof import("../intelligence/decision")>(),
  askDecision: mocks.askDecision,
}));
vi.mock("../venues/liveVenues", () => ({ fetchCandidates: mocks.fetchCandidates }));
vi.mock("../voting/lifecycle", () => ({ openVoting: mocks.openVoting }));

import { env } from "../../env";
import type { MatchingEvent } from "./candidates";
import {
  createUserHangout,
  openEventsByParticipant,
  optionData,
  runPipeline,
  timezoneClosestToVenueCentroid,
  triggerMatcher,
  unusedVenueSnapshots,
} from "./matcher";

const NOW = new Date("2026-09-26T12:00:00Z");
const IDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];
const HORIZON_START = new Date("2026-09-26T14:00:00Z");
const WINDOW_START = new Date("2026-10-01T22:15:00Z");
const WINDOW_END = new Date("2026-10-02T01:00:00Z");
const HORIZON_END = new Date("2026-10-03T12:00:00Z");

const busyBlocks = IDS.flatMap((userId) => [
  { id: `${userId}-before`, userId, startsAt: HORIZON_START, endsAt: WINDOW_START, source: "seed", syncedAt: NOW },
  { id: `${userId}-after`, userId, startsAt: WINDOW_END, endsAt: HORIZON_END, source: "seed", syncedAt: NOW },
]);
const users = IDS.map((id, index) => ({
  id,
  username: `user${index}`,
  email: `user${index}@example.com`,
  passwordHash: "hash",
  timezone: "America/New_York",
  homeLat: 25.75,
  homeLng: -80.37,
  travelMode: "DRIVE",
  createdAt: NOW,
  busyBlocks: busyBlocks.filter((block) => block.userId === id),
  favorites: index < 2 ? [{ category: "restaurant" }] : [{ category: "coffee_shop" }],
}));
const friendships = IDS.flatMap((userLowId, index) =>
  IDS.slice(index + 1).map((userHighId) => ({
    id: `${userLowId}-${userHighId}`,
    userLowId,
    userHighId,
    lowAddedHigh: true,
    highAddedLow: true,
    interactionScore: 0.8,
    lastHangoutAt: new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1_000),
  })),
);
const rankedVenues: RankedVenue[] = [
  { place_id: "place-campus-bistro", name: "Campus Bistro", lat: 25.756, lng: -80.376, primary_type: "restaurant", price_level: 2, rating: 4.5, user_rating_count: 180, travel_minutes: { [IDS[0]!]: 8, [IDS[1]!]: 11, [IDS[2]!]: 14 }, max_travel_min: 14, route_score: 17.3 },
  { place_id: "place-sweetwater-kitchen", name: "Sweetwater Kitchen", lat: 25.763, lng: -80.373, primary_type: "restaurant", price_level: 2, rating: 4.6, user_rating_count: 240, travel_minutes: { [IDS[0]!]: 10, [IDS[1]!]: 12, [IDS[2]!]: 15 }, max_travel_min: 15, route_score: 18.7 },
  { place_id: "place-fiu-grill", name: "FIU Grill", lat: 25.754, lng: -80.38, primary_type: "restaurant", price_level: 2, rating: 4.4, user_rating_count: 130, travel_minutes: { [IDS[0]!]: 9, [IDS[1]!]: 13, [IDS[2]!]: 16 }, max_travel_min: 16, route_score: 19.8 },
  { place_id: "place-sweetwater-bistro", name: "Sweetwater Bistro", lat: 25.768, lng: -80.367, primary_type: "restaurant", price_level: 2, rating: 4.3, user_rating_count: 115, travel_minutes: { [IDS[0]!]: 12, [IDS[1]!]: 16, [IDS[2]!]: 18 }, max_travel_min: 18, route_score: 22.6 },
  { place_id: "place-campus-table", name: "Campus Table", lat: 25.749, lng: -80.385, primary_type: "restaurant", price_level: 2, rating: 4.2, user_rating_count: 95, travel_minutes: { [IDS[0]!]: 14, [IDS[1]!]: 17, [IDS[2]!]: 20 }, max_travel_min: 20, route_score: 25.1 },
];

function resetData() {
  mocks.userFindMany.mockResolvedValue(users);
  mocks.friendshipFindMany.mockResolvedValue(friendships);
  mocks.explicitGroupFindMany.mockResolvedValue([]);
  mocks.eventFindMany.mockResolvedValue([]);
  mocks.eventFindFirst.mockResolvedValue(null);
  mocks.eventCreate.mockResolvedValue({ id: "event-1" });
  mocks.transaction.mockImplementation((callback) => callback({
    event: { findFirst: mocks.eventFindFirst, create: mocks.eventCreate },
  }));
  mocks.fetchCandidates.mockResolvedValue(rankedVenues);
  mocks.curateVenues.mockImplementation(async (venues: RankedVenue[]) => ({
    options: venues.slice(0, 3).map((venue, index: number) => ({
      ...venue,
      rank: index + 1,
      facts_line: `max ${venue.max_travel_min} min travel`,
      ai_blurb: null,
    })),
    matchReason: null,
  }));
  mocks.openVoting.mockResolvedValue(undefined);
  mocks.askDecision.mockRejectedValue(new Error("Decision: no provider configured"));
}
// Thu 18:30–20:45 EDT fits casual_hangout and dinner (the priority pick), so the model is asked both.
const declineWithVibe = {
  model: "jev-1.13.0",
  answers: {
    propose: { type: "choice", choice: "B", confidence: 0.9, probabilities: { A: 0.1, B: 0.9 } },
    vibe: { type: "choice", choice: "casual_hangout", confidence: 0.9, probabilities: { casual_hangout: 0.8, dinner: 0.2 } },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  resetData();
});

describe("venue snapshots", () => {
  it("uses the timezone of the member closest to the curated venue centroid", () => {
    expect(timezoneClosestToVenueCentroid([
      { id: "new-york", timezone: "America/New_York", homeLat: 40.7128, homeLng: -74.006 },
      { id: "chicago", timezone: "America/Chicago", homeLat: 41.8781, homeLng: -87.6298 },
    ], [
      { lat: 41.88, lng: -87.63 },
      { lat: 41.89, lng: -87.62 },
      { lat: 41.87, lng: -87.64 },
    ])).toBe("America/Chicago");
  });

  it("snapshots unselected venues in route order with their top-five ranks", () => {
    const options = [rankedVenues[3]!, rankedVenues[0]!, rankedVenues[4]!];
    const snapshots = unusedVenueSnapshots(rankedVenues, options);

    expect(snapshots.map((venue) => ({ place_id: venue.place_id, rank: venue.rank }))).toEqual([
      { place_id: "place-sweetwater-kitchen", rank: 2 },
      { place_id: "place-fiu-grill", rank: 3 },
    ]);
    expect(snapshots.every((venue) => venue.ai_blurb === null && venue.id === undefined)).toBe(true);
    expect(snapshots.map((venue) => venue.facts_line)).toEqual([
      "★4.6 · $$ · max 15 min travel",
      "★4.4 · $$ · max 16 min travel",
    ]);
  });
});

describe("optionData (#321)", () => {
  const base = { ...rankedVenues[0]!, rank: 1, facts_line: "facts", ai_blurb: null };
  it("stores an option's activity and its own time", () => {
    expect(optionData({ ...base, activity: "Bouldering", starts_at: "2026-10-01T22:30:00Z", ends_at: "2026-10-02T00:30:00Z" }))
      .toMatchObject({ activity: "Bouldering", startsAt: new Date("2026-10-01T22:30:00Z"), endsAt: new Date("2026-10-02T00:30:00Z") });
  });
  it("leaves them unset for options without them", () => {
    expect(optionData(base)).toMatchObject({ activity: undefined, startsAt: undefined, endsAt: undefined });
  });
});

describe("open event index", () => {
  it("matches the old per-user scan for 50 users and 200 events", () => {
    const userIds = Array.from({ length: 50 }, (_, index) => `user-${index}`);
    const events: MatchingEvent[] = Array.from({ length: 200 }, (_, index) => ({
      groupKey: `group-${index}`,
      status: index % 2 ? "voting" : "confirmed",
      startsAt: new Date(NOW.getTime() + index * 60_000),
      endsAt: new Date(NOW.getTime() + (index + 60) * 60_000),
      resolvedAt: null,
      participants: [index, index + 7, index + 13].map((value) => ({ userId: userIds[value % userIds.length]! })),
    }));

    const indexed = openEventsByParticipant(events);
    for (const userId of userIds) {
      const oldScan = events.filter((event) => event.participants.some((participant) => participant.userId === userId));
      expect(indexed.get(userId) ?? []).toEqual(oldScan);
    }
  });
});

describe("matcher pipeline", () => {
  it("loads DB state and atomically writes the one Thursday dinner event", async () => {
    await runPipeline(NOW);

    expect(mocks.userFindMany).toHaveBeenNthCalledWith(1, {
      where: { id: { in: IDS } },
      select: { id: true, timezone: true },
    });
    expect(mocks.userFindMany).toHaveBeenNthCalledWith(2, {
      where: { id: { in: IDS } },
      include: { busyBlocks: true, favorites: true },
    });
    expect(mocks.friendshipFindMany).toHaveBeenCalledOnce();
    expect(mocks.explicitGroupFindMany).toHaveBeenCalledWith({ include: { members: true } });
    expect(mocks.eventFindMany).toHaveBeenNthCalledWith(1, {
      where: {
        status: { in: ["voting", "confirmed"] },
        participants: { some: { userId: { in: IDS } } },
      },
      include: { participants: true },
    });
    expect(mocks.eventFindMany).toHaveBeenNthCalledWith(2, {
      where: {
        groupKey: { in: [
          `${IDS[0]},${IDS[1]}`,
          IDS.join(","),
          `${IDS[0]},${IDS[2]}`,
          `${IDS[1]},${IDS[2]}`,
        ] },
        status: { in: ["expired", "chatted"] },
        resolvedAt: { gte: new Date(NOW.getTime() - env.COOLDOWN_HOURS * 60 * 60 * 1_000) },
      },
      include: { participants: true },
    });
    expect(mocks.fetchCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ vibe_tag: "dinner" }),
      users.map(({ id, timezone, homeLat, homeLng, favorites, travelMode }) => ({ id, timezone, homeLat, homeLng, favorites, travelMode })),
    );
    expect(mocks.curateVenues).toHaveBeenCalledWith(
      rankedVenues,
      {
        vibe_tag: "dinner",
        slot_local: "Thu 18:30–20:30",
        favorite_counts: { restaurant: 2, coffee_shop: 1 },
      },
    );
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.eventFindFirst).toHaveBeenCalledWith({
      where: { groupKey: IDS.join(","), status: { in: ["voting", "confirmed"] } },
      select: { id: true },
    });

    const create = mocks.eventCreate.mock.calls[0]![0];
    expect(create.select).toEqual({ id: true });
    expect(create.data).toMatchObject({
      groupKey: IDS.join(","),
      sourceGroupId: null,
      status: "voting",
      startsAt: new Date("2026-10-01T22:30:00Z"),
      endsAt: new Date("2026-10-02T00:30:00Z"),
      vibeTag: "dinner",
      timezone: "America/New_York",
      matchReason: null,
      voteClosesAt: new Date(NOW.getTime() + env.VOTE_TIMEOUT_SEC * 1_000),
    });
    expect(create.data.backupVenues).toEqual([
      expect.objectContaining({
        place_id: "place-sweetwater-bistro",
        rank: 4,
        ai_blurb: null,
        facts_line: "★4.3 · $$ · max 18 min travel",
      }),
      expect.objectContaining({
        place_id: "place-campus-table",
        rank: 5,
        ai_blurb: null,
        facts_line: "★4.2 · $$ · max 20 min travel",
      }),
    ]);
    expect(create.data.backupVenues.every((venue: { id?: string }) => venue.id === undefined)).toBe(true);
    expect(create.data.participants.create).toEqual(
      IDS.map((userId) => ({ userId, voteStatus: "invited" })),
    );
    expect(create.data.options.create).toHaveLength(3);
    expect(mocks.openVoting).toHaveBeenCalledWith("event-1");
    expect(mocks.eventCreate.mock.invocationCallOrder[0]).toBeLessThan(mocks.openVoting.mock.invocationCallOrder[0]!);
  });

  it("stores the curated match reason on the event", async () => {
    const curate = mocks.curateVenues.getMockImplementation()!;
    mocks.curateVenues.mockImplementationOnce(async (venues: RankedVenue[]) => ({
      ...await curate(venues),
      matchReason: "Shared restaurant favorite on a free Thursday",
    }));
    await runPipeline(NOW);
    expect(mocks.eventCreate.mock.calls[0]![0].data.matchReason).toBe("Shared restaurant favorite on a free Thursday");
  });

  it("drops a group the decision model declines; force keeps it with the chosen vibe", async () => {
    mocks.askDecision.mockResolvedValue(declineWithVibe);
    await runPipeline(NOW);
    expect(mocks.askDecision).toHaveBeenCalledOnce();
    expect(mocks.eventCreate).not.toHaveBeenCalled();

    await runPipeline(NOW, { force: true });
    expect(mocks.eventCreate.mock.calls[0]![0].data).toMatchObject({
      vibeTag: "casual_hangout",
      startsAt: new Date("2026-10-01T22:30:00Z"),
      endsAt: new Date("2026-10-02T00:30:00Z"),
    });
  });

  it("creates no duplicate when the pipeline runs twice", async () => {
    mocks.eventFindFirst.mockResolvedValueOnce(null).mockResolvedValue({ id: "event-1" });
    await runPipeline(NOW);
    await runPipeline(NOW);
    expect(mocks.eventCreate).toHaveBeenCalledOnce();
    expect(mocks.openVoting).toHaveBeenCalledOnce();
  });

  it("skips a group that already has an open event before curation", async () => {
    mocks.eventFindMany.mockResolvedValueOnce([{
      id: "existing",
      groupKey: IDS.join(","),
      status: "voting",
      startsAt: new Date("2026-10-01T22:30:00Z"),
      endsAt: new Date("2026-10-02T00:30:00Z"),
      resolvedAt: null,
      participants: IDS.map((userId) => ({ userId })),
    }]).mockResolvedValueOnce([]);
    await runPipeline(NOW);
    expect(mocks.curateVenues).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("refuses to persist an incomplete curation result", async () => {
    mocks.curateVenues.mockResolvedValue({ options: [], matchReason: null });
    await expect(runPipeline(NOW)).rejects.toThrow("expected 3");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.openVoting).not.toHaveBeenCalled();
  });

  it("does not open voting when the event transaction fails", async () => {
    mocks.transaction.mockRejectedValue(Error("rollback"));
    await expect(runPipeline(NOW)).rejects.toThrow("rollback");
    expect(mocks.openVoting).not.toHaveBeenCalled();
  });
});

describe("matcher mutex", () => {
  it("coalesces concurrent callers and performs one requested rerun", async () => {
    let release: ((value: typeof users) => void) | undefined;
    mocks.userFindMany
      .mockImplementationOnce(() => new Promise<typeof users>((resolve) => { release = resolve; }))
      .mockResolvedValue(users);
    mocks.eventFindFirst.mockResolvedValueOnce(null).mockResolvedValue({ id: "event-1" });

    const first = triggerMatcher();
    const second = triggerMatcher();
    expect(second).toBe(first);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    release!(users);
    await first;

    expect(mocks.userFindMany).toHaveBeenCalledTimes(4);
    expect(mocks.eventCreate).toHaveBeenCalledOnce();
    expect(mocks.openVoting).toHaveBeenCalledOnce();
  });
});

describe("matcher mutex force", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("a coalesced forced call forces the rerun", async () => {
    mocks.askDecision.mockResolvedValue(declineWithVibe);
    let release: ((value: typeof users) => void) | undefined;
    mocks.userFindMany
      .mockImplementationOnce(() => new Promise<typeof users>((resolve) => { release = resolve; }))
      .mockResolvedValue(users);

    const first = triggerMatcher();
    expect(triggerMatcher({ force: true })).toBe(first);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    release!(users);
    await first;

    expect(mocks.askDecision).toHaveBeenCalledTimes(2);
    expect(mocks.eventCreate).toHaveBeenCalledOnce();
    expect(mocks.eventCreate.mock.calls[0]![0].data.vibeTag).toBe("casual_hangout");
  });
});

describe("createUserHangout", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("creates an event with createdById set to callerId", async () => {
    const callerId = IDS[0]!;
    const inviteeIds = [IDS[1]!, IDS[2]!];
    const result = await createUserHangout(callerId, inviteeIds);

    expect(result).toEqual({ eventId: "event-1" });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    const createCall = mocks.eventCreate.mock.calls[0]![0];
    expect(createCall.data).toMatchObject({
      groupKey: IDS.join(","),
      createdById: callerId,
      status: "voting",
    });
    expect(mocks.openVoting).toHaveBeenCalledWith("event-1");
  });

  it("persists both selected squads and one participant per person with squad overlap winning", async () => {
    const selection = {
      squadIds: ["squad-1", "squad-2"], memberIds: IDS,
      participants: [
        { userId: IDS[0]!, inviteSource: "creator" as const, sourceGroupIds: ["squad-1", "squad-2"] },
        { userId: IDS[1]!, inviteSource: "squad" as const, sourceGroupIds: ["squad-1", "squad-2"] },
        { userId: IDS[2]!, inviteSource: "direct" as const, sourceGroupIds: [] },
      ],
    };
    expect(await createUserHangout(IDS[0]!, [IDS[1]!, IDS[2]!], undefined, undefined, undefined, selection))
      .toEqual({ eventId: "event-1" });
    expect(mocks.eventCreate.mock.calls[0]![0].data).toMatchObject({
      createdById: IDS[0], sourceGroupIds: ["squad-1", "squad-2"],
      participants: { create: selection.participants.map((participant) => ({
        ...participant, voteStatus: "invited",
      })) },
    });
    expect(mocks.openVoting).toHaveBeenCalledWith("event-1");
  });

  it("does not create a duplicate open event for the same selected people", async () => {
    mocks.eventFindFirst.mockResolvedValueOnce({ id: "existing" });
    expect(await createUserHangout(IDS[0]!, [IDS[1]!, IDS[2]!])).toEqual({ error: "already_open" });
    expect(mocks.eventCreate).not.toHaveBeenCalled();
    expect(mocks.openVoting).not.toHaveBeenCalled();
  });

  it("stores the curated match reason on the event", async () => {
    const curate = mocks.curateVenues.getMockImplementation()!;
    mocks.curateVenues.mockImplementationOnce(async (venues: RankedVenue[]) => ({ ...await curate(venues), matchReason: "Cozy pick" }));
    await createUserHangout(IDS[0]!, [IDS[1]!, IDS[2]!]);
    expect(mocks.eventCreate.mock.calls[0]![0].data.matchReason).toBe("Cozy pick");
  });

  // The mocked user lookup returns all three users, so invite the other two.
  const INVITEES = [IDS[1]!, IDS[2]!];
  const slotOf = () => {
    const { startsAt, endsAt, vibeTag } = mocks.eventCreate.mock.calls[0]![0].data;
    return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), vibeTag };
  };

  it("matches a requested vibe that is feasible even when another vibe ranks higher", async () => {
    // Thu 18:30–20:45 EDT (after busy padding): dinner is the default pick, but casual_hangout fits too.
    expect(await createUserHangout(IDS[0]!, INVITEES, "casual_hangout")).toEqual({ eventId: "event-1" });
    expect(slotOf()).toEqual({ startsAt: "2026-10-01T22:30:00.000Z", endsAt: "2026-10-02T00:30:00.000Z", vibeTag: "casual_hangout" });
  });

  it("returns no_common_time when no window fits, without searching venues", async () => {
    // Thu 18:30–20:45 EDT is too short for a night out (20:00 start, 2 h minimum).
    expect(await createUserHangout(IDS[0]!, INVITEES, "night_out")).toEqual({ error: "no_common_time" });
    expect(mocks.fetchCandidates).not.toHaveBeenCalled();
  });

  it("returns no_venues when fewer than 3 venues come back", async () => {
    mocks.fetchCandidates.mockResolvedValueOnce([]);
    expect(await createUserHangout(IDS[0]!, INVITEES)).toEqual({ error: "no_venues" });
    expect(mocks.eventCreate).not.toHaveBeenCalled();
  });

  it("searches all of next week, past the default 7-day horizon", async () => {
    mocks.userFindMany.mockResolvedValue(users.map((user) => ({ ...user, busyBlocks: [] })));
    // Next week in New York: Mon Oct 5 00:00 to Mon Oct 12 00:00 EDT (9–16 days from NOW).
    const result = await createUserHangout(IDS[0]!, INVITEES, undefined, "2026-10-05T04:00:00.000Z", "2026-10-12T04:00:00.000Z");
    expect(result).toEqual({ eventId: "event-1" });
    expect(slotOf()).toEqual({ startsAt: "2026-10-05T21:30:00.000Z", endsAt: "2026-10-05T23:30:00.000Z", vibeTag: "dinner" });
  });

  it("clips free windows to [earliest, latest]", async () => {
    mocks.userFindMany.mockResolvedValue(users.map((user) => ({ ...user, busyBlocks: [] })));
    // Tue is free all day; only 16:00–16:50 EDT is asked for.
    await createUserHangout(IDS[0]!, INVITEES, "quick_coffee", "2026-09-29T20:00:00.000Z", "2026-09-29T20:50:00.000Z");
    expect(slotOf()).toEqual({ startsAt: "2026-09-29T20:00:00.000Z", endsAt: "2026-09-29T20:50:00.000Z", vibeTag: "quick_coffee" });
  });
});
