import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EventCardPayload, EventsListResponse } from "@web/contract";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() }));
vi.mock("../../lib/prisma", () => ({ prisma: { event: mocks, friendship: mocks, user: { findUnique: async () => ({ passwordChangedAt: null }) } } }));

const matcherMocks = vi.hoisted(() => ({
  withMatcherMutex: vi.fn(async (cb) => cb()),
  createUserHangout: vi.fn(),
}));
vi.mock("../matching/matcher", () => matcherMocks);


import { signToken } from "../../lib/auth";
import { eventsRouter } from "./router";

const alice = "6f48fb35-1518-481d-ab60-cfd2dcc28acf";
const bob = "975bf379-268d-4b8b-91fc-300a0f96501c";
const ghost = "83f94e85-0f85-4e96-aa82-541be9e7a878";
const eventId = "2b5232d3-9424-4e7c-8e2f-0299693b54eb";
const firstOption = "0b8f7f1e-5b0a-4f7e-9a51-6c2f4b8a1d10";
const secondOption = "d22f38cb-f0e8-4d1c-87bd-d69c926ff19c";
const instant = new Date("2026-10-01T18:30:00Z");

const option = (id: string, rank: number) => ({
  id, eventId, rank, placeId: `place-${rank}`, name: `Venue ${rank}`,
  lat: 25.75, lng: -80.37, primaryType: "restaurant", priceLevel: 2,
  rating: 4.6, userRatingCount: 100, travelMinutes: { [alice]: 10, [bob]: 12 },
  maxTravelMin: 12, routeScore: 14.2, factsLine: "★4.6 · $$ · max 12 min travel", aiBlurb: null,
});

  it("POST /events creates an event when validation passes", async () => {
    // caller is alice, invite bob
    mocks.findMany.mockResolvedValueOnce([{ userLowId: alice, userHighId: bob, lowAddedHigh: true, highAddedLow: false }]);
    matcherMocks.createUserHangout.mockResolvedValueOnce({ eventId });
    mocks.findUnique.mockResolvedValueOnce(event());

    const response = await fetch(`${base}/events`, {
      method: "POST",
      headers: { authorization: `Bearer ${signToken(alice)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ invitee_ids: [bob] }),
    });
    
    expect(response.status).toBe(201);
    expect(matcherMocks.createUserHangout).toHaveBeenCalledWith(alice, [bob], undefined, undefined, undefined);
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: eventId },
      include: expect.not.objectContaining({ creator: expect.anything() }),
    }));
    const body = await response.json();
    expect(body.created_by).toEqual({ id: alice, username: "alice", display_name: "alice" });
  });

  it("POST /events rejects self invite", async () => {
    const response = await fetch(`${base}/events`, {
      method: "POST",
      headers: { authorization: `Bearer ${signToken(alice)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ invitee_ids: [alice] }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_invitees" });
  });

  it("POST /events rejects non-friends", async () => {
    mocks.findMany.mockResolvedValueOnce([{ userLowId: alice, userHighId: bob, lowAddedHigh: false, highAddedLow: true }]);

    const response = await fetch(`${base}/events`, {
      method: "POST",
      headers: { authorization: `Bearer ${signToken(alice)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ invitee_ids: [bob] }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_invitees" });
  });

  it("POST /events rejects invitees with pending friendship status", async () => {
    mocks.findMany.mockResolvedValueOnce([{ userLowId: alice, userHighId: bob, lowAddedHigh: true, highAddedLow: true, status: "pending" }]);

    const response = await fetch(`${base}/events`, {
      method: "POST",
      headers: { authorization: `Bearer ${signToken(alice)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ invitee_ids: [bob] }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_invitees" });
  });

  it("POST /events returns 422 if no common time", async () => {
    mocks.findMany.mockResolvedValueOnce([{ userLowId: alice, userHighId: bob, lowAddedHigh: true, highAddedLow: false }]);
    matcherMocks.createUserHangout.mockResolvedValueOnce({ error: "no_common_time" });

    const response = await fetch(`${base}/events`, {
      method: "POST",
      headers: { authorization: `Bearer ${signToken(alice)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ invitee_ids: [bob] }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "no_common_time" });
  });

  it("POST /events returns 422 no_venues when venues can't be found", async () => {
    mocks.findMany.mockResolvedValueOnce([{ userLowId: alice, userHighId: bob, lowAddedHigh: true, highAddedLow: false }]);
    matcherMocks.createUserHangout.mockResolvedValueOnce({ error: "no_venues" });

    const response = await fetch(`${base}/events`, {
      method: "POST",
      headers: { authorization: `Bearer ${signToken(alice)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ invitee_ids: [bob] }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "no_venues" });
  });

const event = () => ({
  id: eventId, status: "voting", startsAt: instant, endsAt: new Date("2026-10-01T20:30:00Z"),
  timezone: "America/New_York", vibeTag: "dinner", voteClosesAt: new Date("2026-10-01T17:00:00Z"),
  venuePlaceId: null, venueStatus: "open",
  participants: [
    { userId: alice, voteStatus: "voted", user: { id: alice, username: "alice" } },
    { userId: bob, voteStatus: "voted", user: { id: bob, username: "bob" } },
    { userId: ghost, voteStatus: "ghost_passed", user: { id: ghost, username: "ghost" } },
  ],
  options: [option(firstOption, 1), option(secondOption, 2)],
  votes: [{ userId: alice, optionId: firstOption }, { userId: bob, optionId: secondOption }],
});

let base: string;
let close: () => void;
beforeAll(async () => {
  const app = express();
  app.use(eventsRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => close());
beforeEach(() => {
  vi.clearAllMocks();
  mocks.findFirst.mockResolvedValue(event());
  mocks.findMany.mockResolvedValue([event()]);
});
const get = (path: string, userId = alice) => fetch(`${base}${path}`, { headers: { authorization: `Bearer ${signToken(userId)}` } });

describe("events router", () => {
  it("lists only the caller's open or recent events", async () => {
    const response = await get("/events");
    expect(response.status).toBe(200);
    expect(EventsListResponse.parse(await response.json()).events[0]?.id).toBe(eventId);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ participants: { some: { userId: alice } } }),
      include: {
        participants: { include: { user: { select: expect.anything() } } },
        options: true,
        votes: { select: { userId: true, optionId: true } },
      },
    }));
  });

  it("keeps voter identities hidden in GET /events response", async () => {
    const aliceList = EventsListResponse.parse(await (await get("/events", alice)).json());
    const bobList = EventsListResponse.parse(await (await get("/events", bob)).json());
    expect(aliceList.events[0]?.my_option_id).toBe(firstOption);
    expect(bobList.events[0]?.my_option_id).toBe(secondOption);
    expect(JSON.stringify(aliceList)).not.toContain(`"my_option_id":"${secondOption}"`);
    expect(JSON.stringify(bobList)).not.toContain(`"my_option_id":"${firstOption}"`);
    expect(JSON.stringify(aliceList)).not.toContain("userId");
    expect(JSON.stringify(bobList)).not.toContain("userId");
  });

  it("keeps each voter's choice private while voting and counts ghost pass as responded", async () => {
    const aliceBody = EventCardPayload.parse(await (await get(`/events/${eventId}`, alice)).json());
    const bobBody = EventCardPayload.parse(await (await get(`/events/${eventId}`, bob)).json());
    expect(aliceBody.my_option_id).toBe(firstOption);
    expect(bobBody.my_option_id).toBe(secondOption);
    expect(aliceBody.progress).toEqual({ responded: 3, total: 3 });
    expect(aliceBody.outcome).toBeNull();
    expect(bobBody.outcome).toBeNull();
    expect(JSON.stringify(aliceBody)).not.toContain(`"my_option_id":"${secondOption}"`);
    expect(JSON.stringify(bobBody)).not.toContain(`"my_option_id":"${firstOption}"`);
    expect(JSON.stringify(aliceBody)).not.toContain("userId");
    expect(JSON.stringify(bobBody)).not.toContain("userId");
  });

  it("reveals aggregate tallies only after resolution, excluding the ghost passer from attendees", async () => {
    mocks.findFirst.mockResolvedValueOnce({ ...event(), status: "confirmed", venuePlaceId: "place-1" });
    const body = EventCardPayload.parse(await (await get(`/events/${eventId}`)).json());
    expect(body.outcome?.venue?.place_id).toBe("place-1");
    expect(body.outcome?.tallies).toEqual({ [firstOption]: 1, [secondOption]: 1 });
    expect(body.outcome?.attendees.map((person) => person.id)).toEqual([alice, bob]);
  });

  it("keeps venue facts and travel times after a swap to a backup that was never a vote option", async () => {
    const backup = {
      rank: 4, place_id: "place-4", name: "Backup Bistro", lat: 25.76, lng: -80.38,
      primary_type: "restaurant", price_level: 2, rating: 4.4, user_rating_count: 80,
      travel_minutes: { [alice]: 14, [bob]: 9 }, max_travel_min: 14, route_score: 15.1,
      facts_line: "★4.4 · $$ · max 14 min travel", ai_blurb: null,
    };
    mocks.findFirst.mockResolvedValueOnce({ ...event(), status: "confirmed", venuePlaceId: "place-4", venueSnapshot: backup });
    const body = EventCardPayload.parse(await (await get(`/events/${eventId}`)).json());
    expect(body.outcome?.venue).toMatchObject({ place_id: "place-4", facts_line: backup.facts_line, travel_minutes: backup.travel_minutes });
  });

  it("requires authentication and hides events from nonparticipants", async () => {
    expect((await fetch(`${base}/events`)).status).toBe(401);
    expect((await get("/events/not-a-uuid")).status).toBe(404);
    mocks.findFirst.mockResolvedValueOnce(null);
    expect((await get(`/events/${eventId}`, "1ee42e66-229c-4669-a148-cb7b1ea69545")).status).toBe(404);
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ participants: { some: { userId: "1ee42e66-229c-4669-a148-cb7b1ea69545" } } }),
    }));
  });
});
