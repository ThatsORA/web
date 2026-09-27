import type { Prisma } from "@prisma/client";
import { EventCardPayload, EventOption, optionFromRow, type VoteStatus } from "@web/contract";
import { publicUserSelect, toPublicUser } from "../auth/helpers";
import { votingOpen } from "../voting/resolution";
import { chatAccess, invitedParticipant, inviteSource, keepsAccess, viewerScope } from "./invitations";

export type EventWithCardData = Prisma.EventGetPayload<{
  include: {
    participants: { include: { user: { select: typeof publicUserSelect } } };
    options: true;
    votes: { select: { userId: true; optionId: true } };
  };
}>;

/** Whether `userId` still gets this event's card (#210): once voting closes, a Ghost Pass loses it. */
export function canSeeEvent(event: EventWithCardData, userId: string, now: Date): boolean {
  const mine = event.participants.find((participant) => participant.userId === userId);
  return !!mine && keepsAccess({ ...mine, inviteSource: inviteSource(event, userId, mine) }, votingOpen(event, now));
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
  const tallies = resolved && scope.seesEveryone
    ? Object.fromEntries(options.map((option) => [option.id!, event.votes.filter((vote) => vote.optionId === option.id).length]))
    : null;
  const creator = event.createdById ? users.get(event.createdById) : undefined;
  const invited = event.participants.map((participant) => invitedParticipant(event, participant));

  return EventCardPayload.parse({
    id: event.id,
    status: event.status,
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
    progress: { responded, total: event.participants.length },
    my_status: myStatus,
    my_option_id: mine.voteStatus === "ghost_passed" ? null : myVote?.optionId ?? null,
    vote_closes_at: event.voteClosesAt.toISOString(),
    created_by: creator ? toPublicUser(creator) : null,
    outcome: resolved ? {
      venue: venue && scopedTravel(venue, visible),
      venue_status: event.venueStatus,
      attendees: scope.attendeeIds.map((id) => toPublicUser(users.get(id)!)),
      tallies,
    } : null,
  });
}
