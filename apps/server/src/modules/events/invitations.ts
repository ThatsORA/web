// Owner: Andy (#206, #210) — invitation provenance, the one per-viewer privacy rule (plan §9 "Who sees what")
// and who keeps an event after a pass. Pure (no DB, no clock) except eventParticipants(), the one read of
// participants for voting, chat and realtime. Every event payload goes through viewerScope() and every
// post-close audience through keepsAccess(); #212 (chat membership) extends them rather than adding a second rule.
//
// Invite source is derived from fields the event already has, not stored per participant: the schema is
// the steward's (Ojas), and every event that exists today has one squad at most. Mixed events with several
// squads (#207) need stored provenance; see the `schema` issue that follows #206.
import type { EventViewer, InviteSource, PassKind, VoteStatus } from "@web/contract";
import { prisma } from "../../lib/prisma";

export interface EventInvites {
  createdById: string | null;
  sourceGroupId: string | null;
}

/**
 * How `userId` is in the event: the human creator is `creator`; everyone else in a squad's event came in
 * with that squad; everyone else is a direct invite. Automated close-friend proposals have neither field,
 * so everyone in them is direct.
 */
export function inviteSource(event: EventInvites, userId: string): InviteSource {
  if (userId === event.createdById) return "creator";
  return event.sourceGroupId ? "squad" : "direct";
}

/** A direct invite's pass is a Ghost Pass; the creator's and a squad member's pass is a visible "can't make it". */
export const passKind = (source: InviteSource): PassKind => (source === "direct" ? "ghost" : "visible");

export interface ParticipantRow {
  userId: string;
  voteStatus: VoteStatus;
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
  return votingOpen || !hasPassed(row) || passKind(row.inviteSource) === "visible";
}

/** Who gets this event's updates: every participant who keepsAccess(). */
export const eventAudience = (rows: readonly InvitedParticipant[], votingOpen: boolean): string[] =>
  rows.filter((row) => keepsAccess(row, votingOpen)).map((row) => row.userId);

/**
 * Every participant of an event with their invite source and vote status. Voting, chat and realtime read
 * participants only through here, so storing provenance later (the #207 schema issue) changes one place.
 */
export async function eventParticipants(eventId: string): Promise<InvitedParticipant[]> {
  const rows = await prisma.eventParticipant.findMany({
    where: { eventId },
    select: { userId: true, voteStatus: true, event: { select: { createdById: true, sourceGroupId: true } } },
  });
  return rows.map(({ event, ...p }) => ({ ...p, inviteSource: inviteSource(event, p.userId) }));
}

export interface ViewerScope {
  viewer: EventViewer;
  /** People the viewer may see, in event order, the viewer included. `passed` is null where the viewer may not see it. */
  people: { userId: string; inviteSource: InviteSource; passed: boolean | null }[];
  /** After close: the visible people who didn't pass. Only the creator sees everyone, so only they can infer a Ghost Pass. */
  attendeeIds: string[];
  /** The viewer sees every participant, so aggregate counts (tallies) can't reveal a hidden pass. */
  seesEveryone: boolean;
}

/**
 * What `viewerId` may see of an event:
 * - the human creator sees everyone (and `full_roster`); automated events have no creator;
 * - everyone sees the creator, and the creator's pass;
 * - squad members see the other squad members, and their passes;
 * - nobody but the creator sees a direct invitee, and nobody ever sees a Ghost Pass.
 */
export function viewerScope(
  event: EventInvites & { participants: readonly ParticipantRow[] },
  viewerId: string,
): ViewerScope {
  const me = event.participants.find((p) => p.userId === viewerId);
  if (!me) throw new Error("Event requested by non-participant");
  const mySource = inviteSource(event, viewerId);
  const fullRoster = mySource === "creator";
  const rows = event.participants.map((p) => ({ ...p, inviteSource: inviteSource(event, p.userId) }));
  const visible = rows.filter((p) =>
    p.userId === viewerId ||
    fullRoster ||
    p.inviteSource === "creator" ||
    (p.inviteSource === "squad" && mySource === "squad"),
  );
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
