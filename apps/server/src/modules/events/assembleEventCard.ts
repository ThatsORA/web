import type { Prisma } from "@prisma/client";
import { EventCardPayload, EventOption, optionFromRow, type VoteStatus } from "@web/contract";
import { publicUserSelect, toPublicUser } from "../auth/helpers";
import { votingOpen } from "../voting/resolution";
import { chatAccess, invitedParticipant, inviteSource, keepsAccess, lateInvitePending, viewerScope } from "./invitations";

export type EventWithCardData = Prisma.EventGetPayload<{
  include: {
    participants: { include: { user: { select: typeof publicUserSelect } } };
    options: true;
    votes: { select: { userId: true; optionId: true } };
  };
}>;

/** Whether `userId` still gets this event's card (#210): once voting closes, a Ghost Pass loses it. */
export function canSeeEvent(event: EventWithCardData, userId: string, now: Date): boolean {
  if (event.isMixer && event.status === "expired") return false;
  const mine = event.participants.find((participant) => participant.userId === userId);
  if (!mine) return false;
  const row = invitedParticipant(event, mine);
  // An unanswered late invite goes away once the hangout starts (#407).
  if (lateInvitePending(row) && now >= event.startsAt) return false;
  return keepsAccess(row, votingOpen(event, now), event.status);
}

/** Keeps travel times only for people the viewer may see; the keys would otherwise leak the roster. */
function scopedTravel(option: EventOption, visible: ReadonlySet<string>): EventOption {
  return { ...option, travel_minutes: Object.fromEntries(Object.entries(option.travel_minutes).filter(([id]) => visible.has(id))) };
}

/**
 * The card as `userId` may see it (#206): people, attendees and travel times go through viewerScope(),
 * and only the caller's option is exposed while voting. `viewer.chat` comes from chatAccess() (#212), the
 * same rule the chat routes use. Every field is allowlisted by the contract.
 */
export function assembleEventCard(event: EventWithCardData, userId: string, now = new Date()): EventCardPayload {
  const scope = viewerScope(event, userId);
  const visible = new Set(scope.people.map((person) => person.userId));
  const users = new Map(event.participants.map((participant) => [participant.userId, participant.user]));
  const mine = event.participants.find((participant) => participant.userId === userId)!;
  const options = event.options.map(optionFromRow).sort((a, b) => a.rank - b.rank);
  const resolved = event.status !== "voting";
  const myStatus: VoteStatus = mine.voteStatus;
  const myVote = event.votes.find((vote) => vote.userId === userId);
  const responded = event.participants.filter((participant) =>
    participant.voteStatus === "voted" || participant.voteStatus === "ghost_passed" || participant.voteStatus === "confirmed"
  ).length;
  // The snapshot survives a swap to a backup that was never a vote option; the lookup covers events confirmed before it existed.
  const venue = event.venueSnapshot
    ? EventOption.parse(event.venueSnapshot)
    : event.venuePlaceId ? options.find((option) => option.place_id === event.venuePlaceId) ?? null : null;
  // Tallies beside a roster the viewer can't fully see would let them count hidden passes.
  const tallies = !event.isMixer && resolved && scope.seesEveryone
    ? Object.fromEntries(options.map((option) => [option.id!, event.votes.filter((vote) => vote.optionId === option.id).length]))
    : null;
  const creator = !event.isMixer && event.createdById ? users.get(event.createdById) : undefined;
  const invited = event.participants.map((participant) => invitedParticipant(event, participant));
  // Fewer than 2 people going means it isn't happening. Once confirmed only voters go (#407); a chatted
  // hangout counts everyone who didn't pass. A global count, so a viewer's narrower scope can't expire it.
  const going = event.participants.filter((p) => event.status === "chatted"
    ? p.voteStatus !== "ghost_passed"
    : p.voteStatus === "voted" || p.voteStatus === "confirmed").length;
  const effectiveStatus = !event.isMixer && (event.status === "confirmed" || event.status === "chatted") && going < 2
    ? "expired"
    : event.status;

  return EventCardPayload.parse({
    id: event.id,
    is_mixer: event.isMixer === true,
    status: effectiveStatus,
    starts_at: event.startsAt.toISOString(),
    ends_at: event.endsAt.toISOString(),
    timezone: event.timezone,
    vibe_tag: event.vibeTag,
    viewer: { ...scope.viewer, chat: chatAccess(event, invited, userId, now) },
    participants: scope.people.map((person) => ({
      ...toPublicUser(users.get(person.userId)!),
      invite_source: person.inviteSource,
      passed: person.passed,
    })),
    options: options.map((option) => scopedTravel(option, visible)),
    progress: event.isMixer ? null : { responded, total: event.participants.length },
    my_status: myStatus,
    my_option_id: mine.voteStatus === "ghost_passed" ? null : myVote?.optionId ?? null,
    vote_closes_at: event.voteClosesAt.toISOString(),
    updated_at: (event.resolvedAt ?? event.voteClosesAt).toISOString(),
    created_by: creator ? toPublicUser(creator) : null,
    outcome: resolved ? {
      venue: venue && scopedTravel(venue, visible),
      venue_status: event.venueStatus,
      attendees: scope.attendeeIds.map((id) => toPublicUser(users.get(id)!)),
      tallies,
    } : null,
  });
}
