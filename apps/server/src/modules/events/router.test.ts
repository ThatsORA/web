import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EventCardPayload, EventsListResponse } from "@web/contract";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), groupFindMany: vi.fn() }));
vi.mock("../../lib/prisma", () => ({ prisma: { event: mocks, friendship: mocks, explicitGroup: { findMany: mocks.groupFindMany }, user: { findUnique: async () => ({ passwordChangedAt: null }) } } }));

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
  rating: 4.6, userRatingCount: 100, travelMinutes: { [alice]: 10, [bob]: 12, [ghost]: 9 },
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
    expect(matcherMocks.createUserHangout).toHaveBeenCalledWith(alice, [bob], undefined, undefined, undefined,
      expect.objectContaining({ memberIds: [alice, bob].sort(), squadIds: [] }));
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

  it("expands a selected squad and sends its provenance to the matcher", async () => {
    mocks.groupFindMany.mockResolvedValueOnce([{ id: bob, members: [
      { userId: alice, status: "active" }, { userId: bob, status: "active" },
      { userId: ghost, status: "invited" },
    ] }]);
    matcherMocks.createUserHangout.mockResolvedValueOnce({ eventId });
    mocks.findUnique.mockResolvedValueOnce(event());
    const response = await fetch(`${base}/events`, {
      method: "POST",
      headers: { authorization: `Bearer ${signToken(alice)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ squad_ids: [bob] }),
    });
    expect(response.status).toBe(201);
    expect(matcherMocks.createUserHangout).toHaveBeenCalledWith(alice, [], undefined, undefined, undefined, {
      squadIds: [bob], memberIds: [alice, bob].sort(), participants: [
        { userId: alice, inviteSource: "creator", sourceGroupIds: [bob] },
        { userId: bob, inviteSource: "squad", sourceGroupIds: [bob] },
      ].sort((a, b) => a.userId.localeCompare(b.userId)),
    });
  });

  it("rejects a squad when the caller is not an active member", async () => {
    mocks.groupFindMany.mockResolvedValueOnce([{ id: bob, members: [
      { userId: alice, status: "invited" }, { userId: bob, status: "active" },
    ] }]);
    const response = await fetch(`${base}/events`, {
      method: "POST",
      headers: { authorization: `Bearer ${signToken(alice)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ squad_ids: [bob] }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_squads" });
    expect(matcherMocks.createUserHangout).not.toHaveBeenCalled();
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
  venuePlaceId: null, venueStatus: "open", createdById: alice, sourceGroupId: null,
  // alice made it and invited bob and ghost directly; invite source comes from createdById/sourceGroupId (#206).
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
  mocks.groupFindMany.mockResolvedValue([]);
});
const get = (path: string, userId = alice) => fetch(`${base}${path}`, { headers: { authorization: `Bearer ${signToken(userId)}` } });

describe("events router", () => {
  it("shows a Mixer invitee only their own identity and choice, with no response count, roster or tallies", async () => {
    for (const status of ["voting", "confirmed"] as const) {
      mocks.findFirst.mockResolvedValueOnce({ ...event(), isMixer: true, status, venuePlaceId: status === "confirmed" ? "place-1" : null });
      const body = EventCardPayload.parse(await (await get(`/events/${eventId}`, bob)).json());
      expect(body.is_mixer).toBe(true);
      expect(body.status).toBe(status);
      expect(body.created_by).toBeNull();
      expect(body.viewer).toMatchObject({ invite_source: "direct", pass_kind: "ghost", full_roster: false, chat: null });
      expect(body.participants.map((p) => p.id)).toEqual([bob]);
      expect(body.progress).toBeNull();
      expect(body.options.every((o) => Object.keys(o.travel_minutes).every((id) => id === bob))).toBe(true);
      expect(body.outcome?.tallies ?? null).toBeNull();
      expect(body.outcome?.attendees.map((p) => p.id) ?? [bob]).toEqual([bob]);
      expect(JSON.stringify(body)).not.toContain(alice);
      expect(JSON.stringify(body)).not.toContain(ghost);
    }
  });

  it("removes a failed Mixer from detail and list for invitees who had voted", async () => {
    const failed = { ...event(), isMixer: true, status: "expired" };
    mocks.findFirst.mockResolvedValueOnce(failed);
    expect((await get(`/events/${eventId}`, bob)).status).toBe(404);
    mocks.findMany.mockResolvedValueOnce([failed]);
    expect(EventsListResponse.parse(await (await get("/events", bob)).json()).events).toEqual([]);
  });

  it("removes a confirmed Mixer from an invitee who did not commit", async () => {
    const confirmed = { ...event(), isMixer: true, status: "confirmed", venuePlaceId: "place-1",
      participants: event().participants.map((p) => ({ ...p, voteStatus: p.userId === bob ? "invited" : p.voteStatus })) };
    mocks.findFirst.mockResolvedValueOnce(confirmed);
    expect((await get(`/events/${eventId}`, bob)).status).toBe(404);
    mocks.findMany.mockResolvedValueOnce([confirmed]);
    expect(EventsListResponse.parse(await (await get("/events", bob)).json()).events).toEqual([]);
  });

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

  it("shows the creator every direct invitee and every attendee, so only they can infer a ghost pass", async () => {
    mocks.findFirst.mockResolvedValueOnce({ ...event(), status: "confirmed", venuePlaceId: "place-1" });
    const body = EventCardPayload.parse(await (await get(`/events/${eventId}`, alice)).json());
    expect(body.viewer).toEqual({ invite_source: "creator", pass_kind: "visible", full_roster: true, chat: null });
    expect(body.participants.map((p) => [p.id, p.invite_source, p.passed])).toEqual([
      [alice, "creator", false], [bob, "direct", null], [ghost, "direct", null],
    ]);
    expect(body.outcome?.attendees.map((person) => person.id)).toEqual([alice, bob]);
  });

  it("never gives a direct invitee the roster, the ghost passer, or tallies that count them", async () => {
    for (const status of ["voting", "confirmed"] as const) {
      mocks.findFirst.mockResolvedValueOnce({ ...event(), status, venuePlaceId: status === "confirmed" ? "place-1" : null });
      const body = EventCardPayload.parse(await (await get(`/events/${eventId}`, bob)).json());
      expect(body.viewer).toEqual({ invite_source: "direct", pass_kind: "ghost", full_roster: false, chat: null });
      expect(body.created_by?.id).toBe(alice);
      expect(body.participants.map((p) => [p.id, p.passed])).toEqual([[alice, false], [bob, false]]);
      expect(body.options[0]?.travel_minutes).toEqual({ [alice]: 10, [bob]: 12 });
      expect(JSON.stringify(body)).not.toContain(ghost);
      if (status === "confirmed") {
        expect(body.outcome?.attendees.map((person) => person.id)).toEqual([alice, bob]);
        expect(body.outcome?.venue?.travel_minutes).toEqual({ [alice]: 10, [bob]: 12 });
        expect(body.outcome?.tallies).toBeNull();
      }
    }
    const list = EventsListResponse.parse(await (await get("/events", bob)).json());
    expect(JSON.stringify(list)).not.toContain(ghost);
  });

  it("gives nobody a creator view of an automated hangout", async () => {
    mocks.findFirst.mockResolvedValueOnce({ ...event(), createdById: null });
    const body = EventCardPayload.parse(await (await get(`/events/${eventId}`, alice)).json());
    expect(body.created_by).toBeNull();
    expect(body.viewer.full_roster).toBe(false);
    expect(body.participants.map((p) => p.id)).toEqual([alice]);
    expect(body.progress).toEqual({ responded: 3, total: 3 });
  });

  it("shows a squad's automated hangout to every member, with their visible passes", async () => {
    mocks.findFirst.mockResolvedValueOnce({ ...event(), createdById: null, sourceGroupId: "squad-1", endsAt: new Date(Date.now() + 3600_000) });
    const body = EventCardPayload.parse(await (await get(`/events/${eventId}`, bob)).json());
    expect(body.viewer).toEqual({ invite_source: "squad", pass_kind: "visible", full_roster: false, chat: "open" });
    expect(body.participants.map((p) => [p.id, p.invite_source, p.passed])).toEqual([
      [alice, "squad", false], [bob, "squad", false], [ghost, "squad", true],
    ]);
  });

  it("lets a ghost passer keep the card while voting is open, so they can return and vote (#210)", async () => {
    const open = { ...event(), voteClosesAt: new Date(Date.now() + 60_000) };
    mocks.findFirst.mockResolvedValueOnce(open);
    const body = EventCardPayload.parse(await (await get(`/events/${eventId}`, ghost)).json());
    expect(body.my_status).toBe("ghost_passed");
    expect(body.viewer.pass_kind).toBe("ghost");
    mocks.findMany.mockResolvedValueOnce([open]);
    expect(EventsListResponse.parse(await (await get("/events", ghost)).json()).events).toHaveLength(1);
  });

  it("denies a ghost passer the event on detail and list once voting has closed, early or at the deadline (#210)", async () => {
    const closed = [
      { ...event(), status: "confirmed", venuePlaceId: "place-1" },
      { ...event(), status: "expired" },
      { ...event(), voteClosesAt: new Date(Date.now() - 1) }, // deadline passed, sweep not run yet
    ];
    for (const e of closed) {
      mocks.findFirst.mockResolvedValueOnce(e);
      const response = await get(`/events/${eventId}`, ghost);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" }); // same as a stranger
      mocks.findMany.mockResolvedValueOnce([e]);
      expect(EventsListResponse.parse(await (await get("/events", ghost)).json()).events).toEqual([]);
    }
    // Everyone else still gets it.
    mocks.findMany.mockResolvedValueOnce(closed);
    expect(EventsListResponse.parse(await (await get("/events", bob)).json()).events).toHaveLength(3);
  });

  it("keeps a squad passer's card after close and leaves them out of attendees (#210)", async () => {
    const squadEvent = {
      ...event(), status: "confirmed", venuePlaceId: "place-1",
      sourceGroupId: "s1", // a squad's hangout: bob and ghost came in with the squad
    };
    mocks.findFirst.mockResolvedValueOnce(squadEvent);
    const response = await get(`/events/${eventId}`, ghost);
    expect(response.status).toBe(200);
    const body = EventCardPayload.parse(await response.json());
    expect(body.viewer.pass_kind).toBe("visible");
    expect(body.participants.find((p) => p.id === ghost)?.passed).toBe(true);
    expect(body.outcome?.attendees.map((person) => person.id)).not.toContain(ghost);
  });

  it("tells each viewer their chat with the same rule as the chat routes (#212)", async () => {
    const soon = new Date(Date.now() + 3600_000);
    const chatOf = async (e: object, userId: string) => {
      mocks.findFirst.mockResolvedValueOnce(e);
      return EventCardPayload.parse(await (await get(`/events/${eventId}`, userId)).json()).viewer.chat;
    };
    // A squad's hangout made by alice: bob and ghost came in with the squad; ghost passed (visible Pass).
    const squad = { ...event(), sourceGroupId: "s1", endsAt: soon };
    for (const viewer of [alice, bob, ghost]) expect(await chatOf(squad, viewer)).toBe("open"); // voting
    expect(await chatOf({ ...squad, status: "confirmed", venuePlaceId: "place-1" }, ghost)).toBe("open");
    expect(await chatOf({ ...squad, status: "completed", venuePlaceId: "place-1", endsAt: new Date(Date.now() - 60_000) }, bob)).toBe("read_only");
    expect(await chatOf({ ...squad, status: "expired" }, bob)).toBeNull();
    // alice's direct hangout: no chat until it's chatted, and never for the direct ghost passer.
    const direct = { ...event(), endsAt: soon, voteClosesAt: soon };
    expect(await chatOf(direct, bob)).toBeNull();
    expect(await chatOf(direct, ghost)).toBeNull(); // voting still open: keeps the card, not chat
    expect(await chatOf({ ...direct, status: "chatted" }, bob)).toBe("open");
    expect(await chatOf({ ...direct, status: "chatted" }, alice)).toBe("open");
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
