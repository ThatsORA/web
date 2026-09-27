// Owner: Andy — which state the event card is in. Pure, no React Native.
import type { EventCardPayload, EventViewer } from "@web/contract";

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

/** True when a confirmed event's venue changed between two fetches (someone tapped "Change spot"). */
export function detectSwap(prev: EventCardPayload | undefined, next: EventCardPayload): boolean {
  const before = prev?.outcome?.venue?.place_id;
  const after = next.outcome?.venue?.place_id;
  return next.status === "confirmed" && !!before && !!after && before !== after;
}

/** Per-person travel time to the confirmed venue, in attendee order. */
export function travelRows(card: EventCardPayload): { id: string; username: string; display_name: string; minutes: number | null }[] {
  const venue = card.outcome?.venue;
  if (!venue) return [];
  return card.outcome!.attendees.map((a) => ({
    id: a.id,
    username: a.username,
    display_name: a.display_name ?? a.username,
    minutes: venue.travel_minutes[a.id] ?? null,
  }));
}

/** "Change spot" is for confirmed attendees of a confirmed event with a venue (the server enforces the time window). */
export const canChangeSpot = (card: EventCardPayload) =>
  card.status === "confirmed" && card.my_status === "confirmed" && !!card.outcome?.venue;

/** Who a `chatted` card lists as free: the people still in after ghost passes. */
export const freePeople = (card: EventCardPayload) => card.outcome?.attendees ?? card.participants;

/** The slot is over, so its chat is read-only. The contract has `ends_at`, not an `is_ended` flag. */
export const hasEnded = (card: Pick<EventCardPayload, "ends_at">, now = Date.now()) => Date.parse(card.ends_at) <= now;

/** The feed's order: soonest first. */
export const byStart = (a: EventCardPayload, b: EventCardPayload) => Date.parse(a.starts_at) - Date.parse(b.starts_at);

/** Direct invitees see "Ghost Pass"; squad invitees see "Pass (can't make it)". */
export const passButtonLabel = (viewer: EventViewer) =>
  viewer.pass_kind === "ghost" ? "Ghost Pass" : "Pass (can't make it)";

/** Explanation shown when the caller has passed quietly or for a squad hangout. */
export const passedNotice = (viewer: EventViewer) =>
  viewer.pass_kind === "ghost"
    ? "You passed quietly. Nobody else can tell."
    : "You passed (can't make it).";

/** Whether "Open chat" should be shown on this card (active squad/mixed hangouts from creation, or chatted fallback). */
export const canOpenChat = (card: { viewer?: EventViewer | null }) => card.viewer?.chat != null;

/** Squad hangouts are created via squad selection (#206, #268). */
export const isSquadHangout = (card: { viewer?: Pick<EventViewer, "invite_source"> | null }) =>
  card.viewer?.invite_source === "squad";

/** Categorizes participants into responded (voted/confirmed), pending, and passed arrays. */
export function participantBreakdown(card: EventCardPayload) {
  const responded: { id: string; username: string; display_name?: string }[] = [];
  const pending: { id: string; username: string; display_name?: string }[] = [];
  const passed: { id: string; username: string; display_name?: string }[] = [];

  for (const p of card.participants) {
    if (p.passed === true) {
      passed.push(p);
    } else if (card.outcome?.attendees?.some((a) => a.id === p.id)) {
      responded.push(p);
    } else {
      pending.push(p);
    }
  }

  return { responded, pending, passed };
}

/** Formats time remaining for voting based on vote_closes_at ISO string. */
export function votingTimeRemaining(voteClosesAtStr: string, now = Date.now()): string {
  const closesAt = Date.parse(voteClosesAtStr);
  const diffMs = closesAt - now;
  if (diffMs <= 0) return "Voting ending…";
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin >= 60) {
    const hours = Math.floor(diffMin / 60);
    return `${hours}h remaining`;
  }
  if (diffMin >= 1) {
    return `${diffMin}m remaining`;
  }
  return `${diffSec}s remaining`;
}



/** Whether "Can't make it" shows for a late invite (#345): a direct invitee who hasn't responded to a confirmed, unstarted hangout. */
export const canDeclineInvite = (card: EventCardPayload, now = Date.now()) =>
  card.status === "confirmed" && card.my_status === "invited" && card.viewer.invite_source === "direct" &&
  Date.parse(card.starts_at) > now;

/** Whether "Invite friends" shows (#345): voting or confirmed, not a Mixer, not passed, and not started. The server re-checks. */
export const canInvite = (card: EventCardPayload, now = Date.now()) =>
  (card.status === "voting" || card.status === "confirmed") && !card.is_mixer &&
  card.my_status !== "ghost_passed" && Date.parse(card.starts_at) > now;

/**
 * The invite picker's search results (#345): nothing until you type, then every friend whose name or username
 * matches. Anyone already visible on the card comes back `inGroup` (shown faded, not selectable). Hidden
 * participants look like anyone else; the server skips them silently.
 */
export function inviteSearch<F extends { id: string; username: string; display_name?: string | null }>(
  friends: readonly F[],
  card: Pick<EventCardPayload, "participants">,
  query: string,
): { friend: F; inGroup: boolean }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return friends
    .filter((friend) => friend.username.toLowerCase().includes(q) || !!friend.display_name?.toLowerCase().includes(q))
    .map((friend) => ({ friend, inGroup: card.participants.some((p) => p.id === friend.id) }));
}
