// Owner: Andy — "Change spot" on a confirmed card (#219): the confirm copy, the request (#214's route) and its error copy.
// Pure apart from the api() call, so the whole flow is unit-tested.
import { ApiError as ApiErrorBody, ChangeSpotRequest, routes, type EventCardPayload, type EventOption } from "@web/contract";
import { z } from "zod";
import { api, ApiError } from "../../lib/api";

/**
 * The spot a change would move everyone to, or null when the card can't tell.
 * Stub: the card payload has no backup list, so this mirrors the server's order (resolution.ts): the vote
 * options by most votes, then lower route_score, then rank; the next backup follows the current venue.
 * Null when the current venue isn't a vote option or is the last one (the server's unused top-5 comes next).
 * Follow-up: expose `outcome.next_backup` in the contract so the server says it directly.
 */
export function nextBackup(card: EventCardPayload): EventOption | null {
  const venue = card.outcome?.venue;
  const tallies = card.outcome?.tallies;
  if (!venue || !tallies) return null;
  const votes = (o: EventOption) => (o.id ? tallies[o.id] ?? 0 : 0);
  const ordered = [...card.options].sort((a, b) => votes(b) - votes(a) || a.route_score - b.route_score || a.rank - b.rank);
  const at = ordered.findIndex((o) => o.place_id === venue.place_id);
  return at === -1 ? null : ordered[at + 1] ?? null;
}

/** What the attendee confirms before the change goes out to everyone. */
export function changeSpotPrompt(card: EventCardPayload): { title: string; body: string } {
  const next = nextBackup(card);
  return {
    title: "Change spot for everyone?",
    body: next
      ? `Next backup: ${next.name} · max ${Math.round(next.max_travel_min)} min. Everyone's plan and calendar move there.`
      : "Everyone moves to the next backup spot. Their plans and calendars update too.",
  };
}

// The contract defines no success body for change-spot; the caller refetches the card instead.
const Ignored = z.unknown();

/** POST /events/:id/change-spot with the venue we're looking at, so a stale tap can't skip a spot. */
export const requestChangeSpot = (card: EventCardPayload) =>
  api(routes.changeSpot(card.id), Ignored, {
    method: "POST",
    body: ChangeSpotRequest.parse({ current_place_id: card.outcome?.venue?.place_id }),
  });

/** Clear copy for a failed change. The card is refetched either way, so it then shows the real spot. */
export function changeSpotNotice(e: unknown): string {
  const code = e instanceof ApiError ? ApiErrorBody.safeParse(e.body).data?.error : undefined;
  switch (code) {
    case "venue_already_changed":
      return "Someone already changed the spot. Here's the new one.";
    case "no_backup_venue":
      return "No backup spots left, so the plan stays here.";
    default:
      return "Couldn't change the spot. Try again.";
  }
}
