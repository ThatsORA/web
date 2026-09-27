import type { Event } from "@prisma/client";
import { EventOption, type EventOption as EventOptionValue } from "@web/contract";

type SwappableEvent = Pick<Event, "status" | "venuePlaceId" | "startsAt" | "endsAt" | "backupVenues">;

export type SwapDecision =
  | {
      ok: true;
      kind: "swapped";
      data: {
        venuePlaceId: string;
        venueName: string;
        venueLat: number;
        venueLng: number;
        venueSnapshot: EventOptionValue;
        backupVenues: EventOptionValue[];
        venueStatus: "open";
      };
    }
  | { ok: true; kind: "chatted"; data: { status: "chatted"; venueStatus: "reported_closed" } }
  | {
      ok: false;
      status: 403 | 409;
      error: "event_not_confirmed" | "outside_report_window" | "venue_already_changed" | "invalid_backup_venues";
    };

export type ChangeSpotDecision = Exclude<SwapDecision, { ok: true; kind: "chatted" }>
  | { ok: false; status: 409; error: "no_backup_venue" };

/** Pure eligibility and transition logic for a report-closed request. */
export function swapToBackup(
  event: SwappableEvent,
  currentPlaceId: string,
  now: Date,
  reportWindowHours: number,
): SwapDecision {
  if (event.status !== "confirmed") {
    return { ok: false, status: 409, error: "event_not_confirmed" };
  }

  const windowStart = event.startsAt.getTime() - reportWindowHours * 60 * 60 * 1_000;
  if (now.getTime() < windowStart || now.getTime() > event.endsAt.getTime()) {
    return { ok: false, status: 403, error: "outside_report_window" };
  }
  if (event.venuePlaceId !== currentPlaceId) {
    return { ok: false, status: 409, error: "venue_already_changed" };
  }

  const parsed = EventOption.array().safeParse(event.backupVenues);
  if (!parsed.success) {
    return { ok: false, status: 409, error: "invalid_backup_venues" };
  }
  const [next, ...remaining] = parsed.data;
  if (!next) {
    return { ok: true, kind: "chatted", data: { status: "chatted", venueStatus: "reported_closed" } };
  }

  return {
    ok: true,
    kind: "swapped",
    data: {
      venuePlaceId: next.place_id,
      venueName: next.name,
      venueLat: next.lat,
      venueLng: next.lng,
      venueSnapshot: next,
      backupVenues: remaining,
      venueStatus: "open",
    },
  };
}

/** Intentional venue changes leave the confirmed event untouched when no backup remains. */
export function changeSpot(
  event: SwappableEvent,
  currentPlaceId: string,
  now: Date,
  reportWindowHours: number,
): ChangeSpotDecision {
  const decision = swapToBackup(event, currentPlaceId, now, reportWindowHours);
  return decision.ok && decision.kind === "chatted"
    ? { ok: false, status: 409, error: "no_backup_venue" }
    : decision;
}
