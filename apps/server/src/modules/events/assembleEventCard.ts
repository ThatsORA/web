import type { Prisma } from "@prisma/client";
import { EventCardPayload, EventOption, type VoteStatus } from "@web/contract";

export type EventWithCardData = Prisma.EventGetPayload<{
  include: {
    participants: { include: { user: { select: { id: true; username: true } } } };
    options: true;
    votes: { select: { userId: true; optionId: true } };
  };
}>;

function optionFromRow(row: EventWithCardData["options"][number]): EventOption {
  return EventOption.parse({
    id: row.id,
    rank: row.rank,
    place_id: row.placeId,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    primary_type: row.primaryType,
    price_level: row.priceLevel,
    rating: row.rating,
    user_rating_count: row.userRatingCount,
    travel_minutes: row.travelMinutes,
    max_travel_min: row.maxTravelMin,
    route_score: row.routeScore,
    facts_line: row.factsLine,
    ai_blurb: row.aiBlurb,
  });
}

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
  const venue = event.venuePlaceId ? options.find((option) => option.place_id === event.venuePlaceId) ?? null : null;
  const tallies = resolved
    ? Object.fromEntries(options.map((option) => [option.id!, event.votes.filter((vote) => vote.optionId === option.id).length]))
    : null;

  return EventCardPayload.parse({
    id: event.id,
    status: event.status,
    starts_at: event.startsAt.toISOString(),
    ends_at: event.endsAt.toISOString(),
    timezone: event.timezone,
    vibe_tag: event.vibeTag,
    participants: event.participants.map((participant) => participant.user),
    options,
    progress: { responded, total: event.participants.length },
    my_status: myStatus,
    my_option_id: mine.voteStatus === "ghost_passed" ? null : myVote?.optionId ?? null,
    vote_closes_at: event.voteClosesAt.toISOString(),
    outcome: resolved ? {
      venue,
      venue_status: event.venueStatus,
      attendees: event.participants.filter((participant) => participant.voteStatus !== "ghost_passed").map((participant) => participant.user),
      tallies,
    } : null,
  });
}
