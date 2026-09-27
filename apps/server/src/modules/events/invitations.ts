// Owner: Andy (#206) — invitation provenance and the one per-viewer privacy rule (plan §9 "Who sees what").
// Pure: no DB, no clock. Every event payload goes through viewerScope(); #210 (pass lifecycle and
// access) and #212 (chat membership) extend it rather than adding a second rule.
//
// Invite source is derived from fields the event already has, not stored per participant: the schema is
// the steward's (Ojas), and every event that exists today has one squad at most. Mixed events with several
// squads (#207) need stored provenance; see the `schema` issue that follows #206.
import type { EventViewer, InviteSource, PassKind, VoteStatus } from "@web/contract";

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

// #210 adds squad Pass as its own status here.
const hasPassed = (row: ParticipantRow) => row.voteStatus === "ghost_passed";

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
