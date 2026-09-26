import type { Prisma } from "@prisma/client";
import { EventCardPayload, EventOption, optionFromRow, type VoteStatus } from "@web/contract";
import { publicUserSelect, toPublicUser } from "../auth/helpers";

export type EventWithCardData = Prisma.EventGetPayload<{
  include: {
    participants: { include: { user: { select: typeof publicUserSelect } } };
    options: true;
    votes: { select: { userId: true; optionId: true } };
  };
}> & {
  created_by?: { id: string; username: string; displayName?: string | null } | null;
  creator?: { id: string; username: string; displayName?: string | null } | null;
};

/** Only the caller's option is exposed while voting. Every field is allowlisted by the contract. */
export function assembleEventCard(event: EventWithCardData, userId: string): EventCardPayload {
  const options = event.options.map(optionFromRow).sort((a, b) => a.rank - b.rank);
  const mine = event.participants.find((participant) => participant.userId === userId);
  if (!mine) throw new Error("Event card requested by non-participant");
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
  const tallies = resolved
    ? Object.fromEntries(options.map((option) => [option.id!, event.votes.filter((vote) => vote.optionId === option.id).length]))
    : null;

  const createdBy = event.created_by ?? event.creator;

  return EventCardPayload.parse({
    id: event.id,
    status: event.status,
    starts_at: event.startsAt.toISOString(),
    ends_at: event.endsAt.toISOString(),
    timezone: event.timezone,
    vibe_tag: event.vibeTag,
    participants: event.participants.map((participant) => toPublicUser(participant.user)),
    options,
    progress: { responded, total: event.participants.length },
    my_status: myStatus,
    my_option_id: mine.voteStatus === "ghost_passed" ? null : myVote?.optionId ?? null,
    vote_closes_at: event.voteClosesAt.toISOString(),
    created_by: createdBy ? toPublicUser(createdBy) : null,
    outcome: resolved ? {
      venue,
      venue_status: event.venueStatus,
      attendees: event.participants.filter((participant) => participant.voteStatus !== "ghost_passed").map((participant) => toPublicUser(participant.user)),
      tallies,
    } : null,
  });
}
