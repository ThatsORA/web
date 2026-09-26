import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventOption } from "@web/contract";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  findFirst: vi.fn(),
  emitToUsers: vi.fn(),
  pushVenueChanged: vi.fn().mockResolvedValue(undefined),
  assembleEventCard: vi.fn(),
}));
vi.mock("../../lib/prisma", () => ({
  prisma: { user: { findUnique: async () => ({ passwordChangedAt: null }) }, $transaction: mocks.transaction, event: { findFirst: mocks.findFirst } },
}));
vi.mock("../../realtime", () => ({ emitToUsers: mocks.emitToUsers, pushVenueChanged: mocks.pushVenueChanged }));
vi.mock("../events/assembleEventCard", () => ({ assembleEventCard: mocks.assembleEventCard }));

import { signToken } from "../../lib/auth";
import { venuesRouter } from "./router";

const alice = "6f48fb35-1518-481d-ab60-cfd2dcc28acf";
const bob = "975bf379-268d-4b8b-91fc-300a0f96501c";
const stranger = "83f94e85-0f85-4e96-aa82-541be9e7a878";
const eventId = "2b5232d3-9424-4e7c-8e2f-0299693b54eb";
const NOW = new Date("2026-10-01T17:30:00Z");
const backup: EventOption = {
  rank: 2,
  place_id: "backup",
  name: "Backup Bistro",
  lat: 25.76,
  lng: -80.38,
  primary_type: "restaurant",
  price_level: 2,
  rating: 4.4,
  user_rating_count: 80,
  travel_minutes: { [alice]: 14, [bob]: 9 },
  max_travel_min: 14,
  route_score: 15.1,
  facts_line: "★4.4 · $$ · max 14 min travel",
  ai_blurb: null,
};

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: eventId,
    status: "confirmed",
    venuePlaceId: "current",
    startsAt: new Date("2026-10-01T18:30:00Z"),
    endsAt: new Date("2026-10-01T20:30:00Z"),
    backupVenues: [backup],
    participants: [{ userId: alice }, { userId: bob }],
    ...overrides,
  };
}

let base: string;
let close: () => void;
beforeAll(async () => {
  const app = express();
  app.use(express.json(), venuesRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => close());
afterEach(() => vi.useRealTimers());

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mocks.findUnique.mockResolvedValue(event());
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation((callback) => callback({
    event: { findUnique: mocks.findUnique, updateMany: mocks.updateMany },
  }));
  mocks.assembleEventCard.mockReturnValue({ id: eventId, status: "confirmed" });
});

function post(body: unknown, userId = alice, id = eventId) {
  return fetch(`${base}/events/${id}/report-closed`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${signToken(userId)}` },
    body: JSON.stringify(body),
  });
}

describe("POST report-closed", () => {
  it("requires authentication and validates the ID and body before DB access", async () => {
    const unauthenticated = await fetch(`${base}/events/${eventId}/report-closed`, { method: "POST" });
    expect(unauthenticated.status).toBe(401);
    expect((await post({}, alice)).status).toBe(400);
    expect((await post({ current_place_id: "current" }, alice, "not-a-uuid")).status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("swaps in one guarded transaction and emits to every participant", async () => {
    const response = await post({ current_place_id: "current" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "swapped" });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: eventId, status: "confirmed", venuePlaceId: "current" },
      data: {
        venuePlaceId: backup.place_id,
        venueName: backup.name,
        venueLat: backup.lat,
        venueLng: backup.lng,
        venueSnapshot: backup,
        backupVenues: [],
        venueStatus: "open",
      },
    });
    expect(mocks.emitToUsers).toHaveBeenCalledWith(
      [alice, bob],
      "event:venue_changed",
      { event_id: eventId },
    );
    expect(mocks.pushVenueChanged).toHaveBeenCalledWith([alice, bob], eventId);
  });

  it("rejects a nonparticipant without attempting an update", async () => {
    const response = await post({ current_place_id: "current" }, stranger);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_a_participant" });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.emitToUsers).not.toHaveBeenCalled();
    expect(mocks.pushVenueChanged).not.toHaveBeenCalled();
  });

  it("returns the current event on a stale place ID", async () => {
    const current = { ...event(), venuePlaceId: "already-swapped" };
    mocks.findUnique.mockResolvedValue(current);
    mocks.findFirst.mockResolvedValue({ ...current, participants: [], options: [], votes: [] });
    const response = await post({ current_place_id: "current" });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "venue_already_changed",
      event: { id: eventId, status: "confirmed" },
    });
    expect(mocks.assembleEventCard).toHaveBeenCalledWith(expect.objectContaining({ venuePlaceId: "already-swapped" }), alice);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.pushVenueChanged).not.toHaveBeenCalled();
  });

  it("treats a failed place-ID guard as a concurrent swap", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findFirst.mockResolvedValue({ ...event(), participants: [], options: [], votes: [] });
    const response = await post({ current_place_id: "current" });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("venue_already_changed");
    expect(mocks.emitToUsers).not.toHaveBeenCalled();
    expect(mocks.pushVenueChanged).not.toHaveBeenCalled();
  });

  it("moves to chatted and emits when no backups remain", async () => {
    mocks.findUnique.mockResolvedValue(event({ backupVenues: [] }));
    const response = await post({ current_place_id: "current" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "chatted" });
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: "chatted", venueStatus: "reported_closed" },
    }));
    expect(mocks.emitToUsers).toHaveBeenCalledOnce();
    expect(mocks.pushVenueChanged).toHaveBeenCalledWith([alice, bob], eventId);
  });

  it("isolates push notification failures from the response", async () => {
    mocks.pushVenueChanged.mockRejectedValueOnce(new Error("Expo network failure"));
    const response = await post({ current_place_id: "current" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "swapped" });
    expect(mocks.pushVenueChanged).toHaveBeenCalledWith([alice, bob], eventId);
  });
});
