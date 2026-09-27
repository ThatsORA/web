// Owner: Andy (#206, #210) — invitation provenance, the one per-viewer privacy rule (plan §9 "Who sees what")
// and who keeps an event after a pass. Pure (no DB, no clock) except eventParticipants(), the one read of
// participants for voting, chat and realtime. Every event payload goes through viewerScope() and every
// post-close audience through keepsAccess(); chat membership (#212, chatAudience()) is built on eventAudience().
//
// Older events derive invite source from the creator and single source squad. Mixed events store source
// and squad IDs per participant so one squad cannot see members of another squad (#244).
import type { EventChatAccess, EventStatus, EventViewer, InviteSource, PassKind, VoteStatus } from "@web/contract";
import { prisma } from "../../lib/prisma";

export interface EventInvites {
  isMixer?: boolean | null;
  createdById: string | null;
  sourceGroupId: string | null;
  sourceGroupIds?: readonly string[];
  status?: EventStatus;
}

/**
 * How `userId` is in the event: the human creator is `creator`; everyone else in a squad's event came in
 * with that squad; everyone else is a direct invite. Automated close-friend proposals have neither field,
 * so everyone in them is direct.
 */
export function inviteSource(event: EventInvites, userId: string, participant?: Pick<ParticipantRow, "inviteSource">): InviteSource {
  if (event.isMixer) return "direct";
  if (userId === event.createdById) return "creator";
  if (participant?.inviteSource) return participant.inviteSource === "creator" ? "direct" : participant.inviteSource;
  // A mixed event missing one participant's provenance must not grant that person squad access.
  if (event.sourceGroupIds?.length) return "direct";
  return event.sourceGroupId ? "squad" : "direct";
}

function sourceSquads(event: EventInvites, participant: ParticipantRow): readonly string[] {
  if (inviteSource(event, participant.userId, participant) !== "squad") return [];
  if (participant.sourceGroupIds?.length) return participant.sourceGroupIds;
  return event.sourceGroupIds?.length ? [] : event.sourceGroupId ? [event.sourceGroupId] : [];
}

/** Normalize stored and legacy provenance before access and chat checks. */
export function invitedParticipant<T extends ParticipantRow>(event: EventInvites, participant: T): T & InvitedParticipant {
  return {
    ...participant,
    isMixer: event.isMixer === true,
    inviteSource: inviteSource(event, participant.userId, participant),
    sourceGroupIds: sourceSquads(event, participant),
  };
}

/** A direct invite's pass is a Ghost Pass; the creator's and a squad member's pass is a visible "can't make it". */
export const passKind = (source: InviteSource): PassKind => (source === "direct" ? "ghost" : "visible");

export interface ParticipantRow {
  userId: string;
  voteStatus: VoteStatus;
  isMixer?: boolean;
  inviteSource?: InviteSource | null;
  sourceGroupIds?: readonly string[];
}

// Every pass is stored as `ghost_passed`; its kind comes from the invite source (passKind), so a squad
// Pass needs no status of its own (#210, plan Decisions Log).
const hasPassed = (row: ParticipantRow) => row.voteStatus === "ghost_passed";

export interface InvitedParticipant extends ParticipantRow {
  inviteSource: InviteSource;
}

/**
 * Whether this participant still has the event: its card, list entry, chat and socket/push updates (#210).
 * While voting is open everyone does, so a Ghost Pass looks like a vote and can still become one. Once
 * voting closes a Ghost Pass is final and loses the event; a visible Pass (creator, squad, and anyone a
 * selected squad brought in) keeps it, chat included.
 */
export function keepsAccess(row: InvitedParticipant, votingOpen: boolean): boolean {
  if (row.isMixer && !votingOpen) return row.voteStatus === "voted" || row.voteStatus === "confirmed";
  return votingOpen || !hasPassed(row) || passKind(row.inviteSource) === "visible";
}

/** Who gets this event's updates: every participant who keepsAccess(). */
export const eventAudience = (rows: readonly InvitedParticipant[], votingOpen: boolean): string[] =>
  rows.filter((row) => keepsAccess(row, votingOpen)).map((row) => row.userId);

const SQUAD_CHAT_STATUSES: readonly EventStatus[] = ["voting", "confirmed", "chatted", "completed"];
const POST_CLOSE_CHAT_STATUSES: readonly EventStatus[] = ["confirmed", "completed", "chatted"];

/**
 * Who is in the event's chat (#212, #347): everyone here may read it, post until `ends_at`, and gets `event:message`.
 * - Pre-close ("voting"): only squad hangouts where all squad members share a squad ID have chat, and direct invitees are kept out.
 * - Post-close ("confirmed", "completed", "chatted"): all attending members across all event types (direct, squad, user-created, mixer) have chat.
 *   - Direct invitees and mixer participants who confirmed attendance (voted or confirmed) are included.
 *   - Squad members in a shared squad hangout keep access (including squad passers who keep access).
 *   - Ghost-passers remain excluded from chat (they opted out and are not attending).
 * - Expired events have no chat.
 */
export function chatAudience(status: EventStatus, rows: readonly InvitedParticipant[]): string[] {
  const squadRows = rows.filter((row) => row.inviteSource === "squad");
  const hasSquad = squadRows.length > 0;
  const sharedSquad =
    hasSquad &&
    squadRows[0]?.sourceGroupIds?.some((id) => squadRows.every((row) => row.sourceGroupIds?.includes(id)));

  // If there are squad members from separate squads who cannot see each other, no chat room can be opened.
  if (hasSquad && !sharedSquad) return [];

  // Before close ("voting"), only shared squad hangouts have chat, and direct invitees are kept out.
  if (status === "voting") {
    if (rows.some((row) => row.isMixer) || !sharedSquad) return [];
    return eventAudience(rows.filter((row) => row.inviteSource !== "direct"), false);
  }

  // Post-close ("confirmed", "completed", "chatted"): attending members of all event types.
  if (POST_CLOSE_CHAT_STATUSES.includes(status)) {
    return rows
      .filter((row) => {
        if (!keepsAccess(row, false)) return false;
        // Squad members and creator in a shared squad hangout keep access even if they visibly passed
        if (sharedSquad && (row.inviteSource === "squad" || row.inviteSource === "creator")) return true;
        // All other participants (direct invitees, mixer participants, or members of non-squad events) must have confirmed attendance
        return row.voteStatus === "confirmed" || row.voteStatus === "voted";
      })
      .map((row) => row.userId);
  }

  return [];
}

/** The viewer's chat: open until the event ends, then read-only; null if they aren't in chatAudience(). */
export function chatAccess(
  event: { status: EventStatus; endsAt: Date },
  rows: readonly InvitedParticipant[],
  userId: string,
  now: Date,
): EventChatAccess | null {
  if (!chatAudience(event.status, rows).includes(userId)) return null;
  return now < event.endsAt ? "open" : "read_only";
}

/**
 * Every participant of an event with their invite source and vote status. Voting, chat and realtime read
 * participants only through here, using stored provenance when present and legacy derivation otherwise.
 */
export async function eventParticipants(eventId: string): Promise<InvitedParticipant[]> {
  const rows = await prisma.eventParticipant.findMany({
    where: { eventId },
    select: {
      userId: true, voteStatus: true, inviteSource: true, sourceGroupIds: true,
      event: { select: { isMixer: true, createdById: true, sourceGroupId: true, sourceGroupIds: true } },
    },
  });
  return rows.map(({ event, ...p }) => invitedParticipant(event, p));
}

export interface ViewerScope {
  /** Everything but `chat`, which the card adds from chatAccess(). */
  viewer: Omit<EventViewer, "chat">;
  /** People the viewer may see, in event order, the viewer included. `passed` is null where the viewer may not see it. */
  people: { userId: string; inviteSource: InviteSource; passed: boolean | null }[];
  /** After close: the visible people who didn't pass. Only the creator sees everyone, so only they can infer a Ghost Pass. */
  attendeeIds: string[];
  /** The viewer sees every participant, so aggregate counts (tallies) can't reveal a hidden pass. */
  seesEveryone: boolean;
}

/** If this participant was invited directly into an existing event, returns who invited them. */
export function inviterId(participant?: ParticipantRow): string | null {
  const match = participant?.sourceGroupIds?.find((id) => id.startsWith("invited_by:"));
  return match ? match.slice("invited_by:".length) : null;
}

/**
 * What `viewerId` may see of an event:
 * - the human creator sees everyone (and `full_roster`); automated events have no creator;
 * - everyone sees the creator, and the creator's pass;
 * - squad members see people invited by at least one of the same squads, and their visible passes;
 * - direct invitees see themselves, the creator, and who invited them; inviters see their direct invitees;
 * - nobody ever sees a Ghost Pass.
 */
export function viewerScope(
  event: EventInvites & { participants: readonly ParticipantRow[] },
  viewerId: string,
): ViewerScope {
  const me = event.participants.find((p) => p.userId === viewerId);
  if (!me) throw new Error("Event requested by non-participant");
  const mySource = inviteSource(event, viewerId, me);
  const fullRoster = !event.isMixer && mySource === "creator";
  const mySquads = new Set(sourceSquads(event, me));
  const myInviter = inviterId(me);
  const rows = event.participants.map((p) => ({
    ...p,
    inviteSource: inviteSource(event, p.userId, p),
    inviter: inviterId(p),
  }));
  const isConfirmed = event.status === "confirmed" || event.status === "completed";
  const visible = rows.filter((p) => {
    if (p.userId === viewerId) return true;
    if (event.isMixer) return false;
    if (isConfirmed && !hasPassed(p)) return true;
    return (
      fullRoster ||
      p.inviteSource === "creator" ||
      (p.inviteSource === "squad" && mySource === "squad" && sourceSquads(event, p).some((id) => mySquads.has(id))) ||
      (myInviter !== null && p.userId === myInviter) ||
      (p.inviter === viewerId)
    );
  });
  return {
    viewer: { invite_source: mySource, pass_kind: passKind(mySource), full_roster: fullRoster },
    people: visible.map((p) => ({
      userId: p.userId,
      inviteSource: p.inviteSource,
      passed: p.userId === viewerId || passKind(p.inviteSource) === "visible" ? hasPassed(p) : null,
    })),
    attendeeIds: visible.filter((p) => !hasPassed(p)).map((p) => p.userId),
    seesEveryone: visible.length === event.participants.length,
  };
}
