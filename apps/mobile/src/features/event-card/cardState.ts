// Owner: Andy — which state the event card is in. Pure, no React Native.
import type { EventCardPayload } from "@web/contract";

export type CardKind = "voting" | "waiting" | "confirmed" | "chatted" | "expired" | "completed";

/**
 * voting   — open, and I haven't responded yet
 * waiting  — open, I voted or ghost passed ("2 of 3 responded")
 * the rest — the event's resolved status
 * ("Finding a time…" is the feed with no events; "swapped" is confirmed plus a banner, see detectSwap.)
 */
export function cardKind(card: Pick<EventCardPayload, "status" | "my_status">): CardKind {
  if (card.status !== "voting") return card.status;
  return card.my_status === "invited" ? "voting" : "waiting";
}

/** True when a confirmed event's venue changed between two fetches (someone tapped "It's closed"). */
export function detectSwap(prev: EventCardPayload | undefined, next: EventCardPayload): boolean {
  const before = prev?.outcome?.venue?.place_id;
  const after = next.outcome?.venue?.place_id;
  return next.status === "confirmed" && !!before && !!after && before !== after;
}

/** Per-person travel time to the confirmed venue, in attendee order. */
export function travelRows(card: EventCardPayload): { id: string; username: string; minutes: number | null }[] {
  const venue = card.outcome?.venue;
  if (!venue) return [];
  return card.outcome!.attendees.map((a) => ({
    id: a.id,
    username: a.username,
    minutes: venue.travel_minutes[a.id] ?? null,
  }));
}

/** "It's closed" is offered on a confirmed event with a venue (the server enforces the time window). */
export const canReportClosed = (card: EventCardPayload) => card.status === "confirmed" && !!card.outcome?.venue;

/** Who a `chatted` card lists as free: the people still in after ghost passes. */
export const freePeople = (card: EventCardPayload) => card.outcome?.attendees ?? card.participants;

/** The slot is over, so its chat is read-only. The contract has `ends_at`, not an `is_ended` flag. */
export const hasEnded = (card: Pick<EventCardPayload, "ends_at">, now = Date.now()) => Date.parse(card.ends_at) <= now;

/** The feed's order: soonest first. */
export const byStart = (a: EventCardPayload, b: EventCardPayload) => Date.parse(a.starts_at) - Date.parse(b.starts_at);
