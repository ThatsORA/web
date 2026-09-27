// Owner: Andy (#345) — inviting friends into a hangout that already exists. Pure: no DB, no clock.
// A late invitee is always a direct invite, so §9 "Who sees what" holds unchanged: they see themselves and the
// creator, their pass is a Ghost Pass, and they never join a squad chat. Same path for squad and friend hangouts.
import type { EventStatus } from "@web/contract";
import { votingOpen } from "../voting/resolution";
import type { InvitedParticipant } from "./invitations";

export interface LateInviteEvent {
  status: EventStatus;
  isMixer: boolean | null;
  startsAt: Date;
  voteClosesAt: Date;
}

export type InviteBlock = "not_found" | "closed";

/**
 * Whether `me` may invite people now: a participant who still has the event and hasn't passed, on a
 * non-Mixer that is voting or confirmed and hasn't started. `not_found` hides events the caller can't see.
 */
export function inviteBlock(event: LateInviteEvent, me: InvitedParticipant | undefined, now: Date): InviteBlock | null {
  if (!me) return "not_found";
  const open = votingOpen(event, now);
  // A Ghost Pass after close loses the event entirely (#210); any other pass keeps it but can't invite.
  if (me.voteStatus === "ghost_passed") return !open && me.inviteSource === "direct" ? "not_found" : "closed";
  if (event.isMixer) return "closed";
  if (now >= event.startsAt) return "closed";
  return open || event.status === "confirmed" ? null : "closed";
}

interface FriendRow {
  userLowId: string;
  userHighId: string;
  status: string;
}

/**
 * The invitees to add: every id must be an accepted friend of the caller (400 otherwise). Anyone already in
 * the event is skipped silently, so the response never reveals a hidden direct invitee (§9).
 */
export function lateInvitees(
  callerId: string,
  inviteeIds: readonly string[],
  friendships: readonly FriendRow[],
  participantIds: readonly string[],
): string[] | { error: "invalid_invitees" } {
  const ids = [...new Set(inviteeIds)];
  const friends = new Set(friendships
    .filter((row) => row.status === "accepted" && (row.userLowId === callerId || row.userHighId === callerId))
    .map((row) => (row.userLowId === callerId ? row.userHighId : row.userLowId)));
  if (ids.some((id) => !friends.has(id))) return { error: "invalid_invitees" };
  return ids.filter((id) => !participantIds.includes(id));
}

/**
 * Whether `me` can still say "Can't make it" after voting closed: a direct invitee who never responded, on a
 * confirmed hangout that hasn't started. This is how a late invite to a confirmed hangout gets declined; it also
 * covers an original direct invitee who never voted, who would otherwise count as attending.
 */
export function canDecline(event: LateInviteEvent, me: InvitedParticipant | undefined, now: Date): boolean {
  return !!me && !event.isMixer && event.status === "confirmed" && now < event.startsAt &&
    !votingOpen(event, now) && me.inviteSource === "direct" && me.voteStatus === "invited";
}
