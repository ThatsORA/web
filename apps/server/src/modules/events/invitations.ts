// Owner: Andy (#206) — invitation provenance and the one per-viewer privacy rule (plan §9 "Who sees what").
// Pure: no DB, no clock. Every event payload goes through viewerScope(); #210 (pass lifecycle and
// access) and #212 (chat membership) extend it rather than adding a second rule.
import type { EventViewer, InviteSource, PassKind, VoteStatus } from "@web/contract";

export interface InviteRow {
  userId: string;
  inviteSource: InviteSource;
  squadIds: string[];
}

const byUserId = (a: InviteRow, b: InviteRow) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0);

/**
 * Who is in a new event and how, one row per person. Squads bring in the members the caller passes
 * (active members only; filtering is the caller's job). Squad wins over a direct pick or being the
 * creator, and someone in several selected squads keeps all of them. Sorted like groupKey.
 */
export function resolveInvites({
  creatorId,
  directIds = [],
  squads = [],
}: {
  creatorId: string | null;
  directIds?: readonly string[];
  squads?: readonly { id: string; memberIds: readonly string[] }[];
}): InviteRow[] {
  const rows = new Map<string, InviteRow>();
  for (const userId of directIds) rows.set(userId, { userId, inviteSource: "direct", squadIds: [] });
  if (creatorId) rows.set(creatorId, { userId: creatorId, inviteSource: "creator", squadIds: [] });
  for (const squad of squads) {
    for (const userId of squad.memberIds) {
      const row = rows.get(userId);
      if (row?.inviteSource !== "squad") rows.set(userId, { userId, inviteSource: "squad", squadIds: [squad.id] });
      else if (!row.squadIds.includes(squad.id)) row.squadIds.push(squad.id);
    }
  }
  return [...rows.values()].sort(byUserId);
}

/** A direct invite's pass is a Ghost Pass; the creator's and a squad member's pass is a visible "can't make it". */
export const passKind = (source: InviteSource): PassKind => (source === "direct" ? "ghost" : "visible");

export interface ParticipantRow extends InviteRow {
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
 * - squad members see the members of a squad they came in with, and their passes;
 * - nobody but the creator sees a direct invitee, and nobody ever sees a Ghost Pass.
 */
export function viewerScope(
  event: { createdById: string | null; participants: readonly ParticipantRow[] },
  viewerId: string,
): ViewerScope {
  const me = event.participants.find((p) => p.userId === viewerId);
  if (!me) throw new Error("Event requested by non-participant");
  const fullRoster = event.createdById === viewerId;
  const mySquads = me.inviteSource === "squad" ? me.squadIds : [];
  const visible = event.participants.filter((p) =>
    p.userId === viewerId ||
    fullRoster ||
    p.userId === event.createdById ||
    (p.inviteSource === "squad" && p.squadIds.some((id) => mySquads.includes(id))),
  );
  return {
    viewer: { invite_source: me.inviteSource, pass_kind: passKind(me.inviteSource), full_roster: fullRoster },
    people: visible.map((p) => ({
      userId: p.userId,
      inviteSource: p.inviteSource,
      passed: p.userId === viewerId || passKind(p.inviteSource) === "visible" ? hasPassed(p) : null,
    })),
    attendeeIds: visible.filter((p) => !hasPassed(p)).map((p) => p.userId),
    seesEveryone: visible.length === event.participants.length,
  };
}
