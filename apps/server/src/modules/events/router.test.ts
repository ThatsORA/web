import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EventCardPayload, EventsListResponse } from "@web/contract";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), findMany: vi.fn() }));
vi.mock("../../lib/prisma", () => ({ prisma: { event: mocks } }));

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
  mocks.findMany.mockResolvedValue([{ id: eventId, status: "voting", startsAt: instant, vibeTag: "dinner" }]);
});
const get = (path: string, userId = alice) => fetch(`${base}${path}`, { headers: { authorization: `Bearer ${signToken(userId)}` } });

describe("events router", () => {
  it("lists only the caller's open or recent events", async () => {
    const response = await get("/events");
    expect(response.status).toBe(200);
    expect(EventsListResponse.parse(await response.json()).events[0]?.id).toBe(eventId);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ participants: { some: { userId: alice } } }),
    }));
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
