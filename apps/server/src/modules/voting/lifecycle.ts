// Owner: Ojas — called by Riley's matcher after it writes the event row.
// openVoting emits event:created to every participant; the 15 s sweep
// closes/resolves events (plan §9–§10).
import { EventOption, optionFromRow } from "@web/contract";
import { env } from "../../env";
import { prisma } from "../../lib/prisma";
import { emitToUsers, pushEventCreated, pushEventResolved } from "../../realtime";
import { eventAudience, eventParticipants } from "../events/invitations";
import { progress, resolveEvent, voteClosesAt, winnerTime } from "./resolution";

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
  void pushEventCreated(
    event.participants.map((p) => p.userId),
    eventId,
    {
      startsAt: event.startsAt,
      vibeTag: event.vibeTag,
      timezone: event.timezone,
      ...(event.isMixer ? { isMixer: true } : {}),
    },
  ).catch((e: unknown) => console.error("pushEventCreated error", e));
}

/**
 * After a vote or pass: broadcast responded/total to everyone (voting is still open, so a Ghost Pass looks like
 * a vote), and close early once everyone has responded, which makes every response final.
 */
export async function afterResponse(eventId: string): Promise<void> {
  const participants = await prisma.eventParticipant.findMany({
    where: { eventId },
    select: { userId: true, voteStatus: true, event: { select: { isMixer: true } } },
  });
  const p = progress(participants.map((x) => x.voteStatus));
  emitToUsers(participants.map((x) => x.userId), "event:progress", participants[0]?.event?.isMixer
    ? { event_id: eventId }
    : { event_id: eventId, ...p });
  if (p.responded === p.total) await closeVoting(eventId);
}

export async function closeVoting(eventId: string): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { options: true, votes: true },
  });
  if (!event || event.status !== "voting") return;
  const participants = await eventParticipants(eventId);

  const unused = EventOption.array().safeParse(event.backupVenues);
  const r = resolveEvent({
    isMixer: event.isMixer === true,
    participants,
    votes: event.votes,
    options: event.options.map(optionFromRow),
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
              ...winnerTime(r.winner),
              venuePlaceId: r.winner.place_id,
              venueName: r.winner.name,
              venueLat: r.winner.lat,
              venueLng: r.winner.lng,
              venueSnapshot: r.winner,
              venueStatus: "open",
              backupVenues: r.backups,
              ...(r.wasTiebreaker
                ? { matchReason: `${event.matchReason ? event.matchReason + " · " : ""}Tiebreaker: Chosen by travel score` }
                : {}),
            }
          : { status: r.status, resolvedAt: now },
    });
    if (count && r.status === "confirmed") {
      await tx.eventParticipant.updateMany({ where: { eventId, voteStatus: "voted" }, data: { voteStatus: "confirmed" } });
    }
    return count > 0;
  });
  if (claimed) {
    // Voting is closed now: a Ghost Pass is final, so its passer stops getting this event (#210).
    const audience = event.isMixer && r.status === "expired"
      ? participants.map((participant) => participant.userId)
      : eventAudience(participants, false);
    emitToUsers(audience, "event:resolved", { event_id: eventId, status: r.status });
    if (r.status === "confirmed") {
      void pushEventResolved(
        audience,
        eventId,
        r.status,
      ).catch((e: unknown) => console.error("pushEventResolved error", e));
    }
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
    select: { id: true },
  });
  for (const event of ended) {
    const { count } = await prisma.event.updateMany({ where: { id: event.id, status: "confirmed" }, data: { status: "completed" } });
    if (count) {
      const audience = eventAudience(await eventParticipants(event.id), false);
      emitToUsers(audience, "event:resolved", { event_id: event.id, status: "completed" });
    }
  }
}
