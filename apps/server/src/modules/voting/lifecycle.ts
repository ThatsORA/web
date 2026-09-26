// Owner: Ojas — called by Riley's matcher after it writes the event row.
// openVoting emits event:created to every participant; the 15 s sweep
// closes/resolves events (plan §9–§10).
import type { EventOption as OptionRow } from "@prisma/client";
import { EventOption } from "@web/contract";
import { env } from "../../env";
import { prisma } from "../../lib/prisma";
import { emitToUsers } from "../../realtime";
import { progress, resolveEvent, voteClosesAt } from "./resolution";

function toOption(o: OptionRow): EventOption & { id: string } {
  return {
    id: o.id,
    rank: o.rank,
    place_id: o.placeId,
    name: o.name,
    lat: o.lat,
    lng: o.lng,
    primary_type: o.primaryType,
    price_level: o.priceLevel,
    rating: o.rating,
    user_rating_count: o.userRatingCount,
    travel_minutes: o.travelMinutes as Record<string, number>,
    max_travel_min: o.maxTravelMin,
    route_score: o.routeScore,
    facts_line: o.factsLine,
    ai_blurb: o.aiBlurb,
  };
}

export async function openVoting(eventId: string): Promise<void> {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    include: { participants: { select: { userId: true } } },
  });
  await prisma.event.update({
    where: { id: eventId },
    data: { voteClosesAt: voteClosesAt(event.createdAt, event.startsAt, env.VOTE_TIMEOUT_SEC) },
  });
  emitToUsers(event.participants.map((p) => p.userId), "event:created", { event_id: eventId });
}

/** After a vote or ghost pass: broadcast responded/total, and close early once everyone has responded. */
export async function afterResponse(eventId: string): Promise<void> {
  const participants = await prisma.eventParticipant.findMany({ where: { eventId } });
  const p = progress(participants.map((x) => x.voteStatus));
  emitToUsers(participants.map((x) => x.userId), "event:progress", { event_id: eventId, ...p });
  if (p.responded === p.total) await closeVoting(eventId);
}

export async function closeVoting(eventId: string): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { participants: true, options: true, votes: true },
  });
  if (!event || event.status !== "voting") return;

  const unused = EventOption.array().safeParse(event.backupVenues);
  const r = resolveEvent({
    participants: event.participants,
    votes: event.votes,
    options: event.options.map(toOption),
    unusedVenues: unused.success ? unused.data : [],
  });
  const now = new Date();

  const claimed = await prisma.$transaction(async (tx) => {
    // Claim with a status guard so a vote and the sweep can't both resolve it.
    const { count } = await tx.event.updateMany({
      where: { id: eventId, status: "voting" },
      data:
        r.status === "confirmed"
          ? {
              status: "confirmed",
              resolvedAt: now,
              venuePlaceId: r.winner.place_id,
              venueName: r.winner.name,
              venueLat: r.winner.lat,
              venueLng: r.winner.lng,
              venueSnapshot: r.winner,
              venueStatus: "open",
              backupVenues: r.backups,
            }
          : { status: r.status, resolvedAt: now },
    });
    if (count && r.status === "confirmed") {
      await tx.eventParticipant.updateMany({ where: { eventId, voteStatus: "voted" }, data: { voteStatus: "confirmed" } });
    }
    return count > 0;
  });
  if (claimed) {
    emitToUsers(event.participants.map((p) => p.userId), "event:resolved", { event_id: eventId, status: r.status });
  }
}

export async function sweepVoting(now = new Date()): Promise<void> {
  const due = await prisma.event.findMany({
    where: { status: "voting", voteClosesAt: { lte: now } },
    select: { id: true },
  });
  await Promise.all(
    due.map(({ id }) => closeVoting(id).catch((e: unknown) => console.error("closeVoting", id, e))),
  );

  const ended = await prisma.event.findMany({
    where: { status: "confirmed", endsAt: { lte: now } },
    include: { participants: { select: { userId: true } } },
  });
  for (const event of ended) {
    const { count } = await prisma.event.updateMany({ where: { id: event.id, status: "confirmed" }, data: { status: "completed" } });
    if (count) emitToUsers(event.participants.map((p) => p.userId), "event:resolved", { event_id: event.id, status: "completed" });
  }
}
