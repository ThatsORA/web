// Owner: Andy — pure logic for the "+ New hangout" screen (#70): the invite limit,
// the this/next week range, and the POST /events body. No React Native.
import { CreateEventRequest, type VibeTag } from "@web/contract";
import { ApiError } from "./api";

/** CreateEventRequest allows 1–5 invitees. */
export const MAX_INVITEES = 5;

export type Week = "this" | "next";

/** Adds or removes `id`. Adding past MAX_INVITEES is ignored. */
export function toggleInvitee(selected: string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter((s) => s !== id);
  return selected.length >= MAX_INVITEES ? selected : [...selected, id];
}

/**
 * Monday-start weeks in the phone's local time, sent as instants.
 * "this": now until next Monday 00:00. "next": next Monday 00:00 until the Monday after.
 */
export function weekRange(week: Week, now: Date): { earliest: string; latest: string } {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7)); // next Monday 00:00
  const start = week === "this" ? now : monday;
  const end = new Date(monday);
  if (week === "next") end.setDate(end.getDate() + 7);
  return { earliest: start.toISOString(), latest: end.toISOString() };
}

/** "Try a different week": this ↔ next; "any time" (the default horizon) moves to next week. */
export const otherWeek = (week: Week | null): Week => (week === "next" ? "this" : "next");

export function buildCreateEventRequest(
  input: { inviteeIds: string[]; vibe: VibeTag | null; week: Week | null },
  now: Date,
): CreateEventRequest {
  return CreateEventRequest.parse({
    invitee_ids: input.inviteeIds,
    ...(input.vibe ? { vibe_tag: input.vibe } : {}),
    ...(input.week ? weekRange(input.week, now) : {}),
  });
}

/**
 * POST /events answers 422 `no_common_time` when the group has no shared free window, and
 * 422 `no_venues` when someone has no home location or too few places are nearby.
 */
export function noMatchReason(e: unknown): "no_common_time" | "no_venues" | null {
  if (!(e instanceof ApiError) || e.status !== 422) return null;
  const error = (e.body as { error?: unknown } | null)?.error;
  return error === "no_common_time" || error === "no_venues" ? error : null;
}
