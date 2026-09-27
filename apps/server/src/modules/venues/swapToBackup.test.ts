import { describe, expect, it } from "vitest";
import type { EventOption } from "@web/contract";
import { changeSpot, swapToBackup } from "./swapToBackup";

const startsAt = new Date("2026-10-01T18:30:00Z");
const endsAt = new Date("2026-10-01T20:30:00Z");
const now = new Date("2026-10-01T17:30:00Z");
const option = (place_id: string, rank: number): EventOption => ({
  rank,
  place_id,
  name: `Venue ${rank}`,
  lat: 25.75 + rank / 100,
  lng: -80.37,
  primary_type: "restaurant",
  price_level: 2,
  rating: 4.5,
  user_rating_count: 100,
  travel_minutes: {},
  max_travel_min: 12,
  route_score: 14 + rank,
  facts_line: `facts ${rank}`,
  ai_blurb: null,
});
const backupA = option("backup-a", 2);
const backupB = option("backup-b", 3);
const event = (backupVenues: EventOption[] = [backupA, backupB]) => ({
  status: "confirmed" as const,
  venuePlaceId: "current",
  startsAt,
  endsAt,
  backupVenues,
});

describe("swapToBackup", () => {
  it("promotes the first backup, preserves its snapshot and shifts the list", () => {
    expect(swapToBackup(event(), "current", now, 24)).toEqual({
      ok: true,
      kind: "swapped",
      data: {
        venuePlaceId: backupA.place_id,
        venueName: backupA.name,
        venueLat: backupA.lat,
        venueLng: backupA.lng,
        venueSnapshot: backupA,
        backupVenues: [backupB],
        venueStatus: "open",
      },
    });
  });

  it("uses the final backup and leaves a confirmed event with an empty list", () => {
    const result = swapToBackup(event([backupA]), "current", now, 24);
    expect(result).toMatchObject({ ok: true, kind: "swapped", data: { backupVenues: [] } });
  });

  it("moves to chatted when no backup remains", () => {
    expect(swapToBackup(event([]), "current", now, 24)).toEqual({
      ok: true,
      kind: "chatted",
      data: { status: "chatted", venueStatus: "reported_closed" },
    });
  });

  it("returns a stale-place conflict without changing anything", () => {
    expect(swapToBackup(event(), "old-place", now, 24)).toEqual({
      ok: false,
      status: 409,
      error: "venue_already_changed",
    });
  });

  it("rejects reports before and after the inclusive reporting window", () => {
    expect(swapToBackup(event(), "current", new Date("2026-09-30T18:29:59.999Z"), 24)).toMatchObject({
      ok: false,
      status: 403,
      error: "outside_report_window",
    });
    expect(swapToBackup(event(), "current", new Date("2026-10-01T20:30:00.001Z"), 24)).toMatchObject({
      ok: false,
      status: 403,
      error: "outside_report_window",
    });
    expect(swapToBackup(event(), "current", new Date("2026-09-30T18:30:00Z"), 24).ok).toBe(true);
    expect(swapToBackup(event(), "current", endsAt, 24).ok).toBe(true);
  });

  it("requires a confirmed event and valid backup snapshots", () => {
    expect(swapToBackup({ ...event(), status: "voting" }, "current", now, 24)).toMatchObject({
      ok: false,
      status: 409,
      error: "event_not_confirmed",
    });
    expect(swapToBackup({ ...event(), backupVenues: [{ nope: true }] }, "current", now, 24)).toMatchObject({
      ok: false,
      status: 409,
      error: "invalid_backup_venues",
    });
  });
});

describe("changeSpot", () => {
  it("uses the existing next-backup transition", () => {
    expect(changeSpot(event(), "current", now, 24)).toMatchObject({
      ok: true,
      kind: "swapped",
      data: { venuePlaceId: "backup-a", backupVenues: [backupB] },
    });
  });

  it("rejects an exhausted backup list without moving the event to chatted", () => {
    expect(changeSpot(event([]), "current", now, 24)).toEqual({
      ok: false,
      status: 409,
      error: "no_backup_venue",
    });
  });
});
