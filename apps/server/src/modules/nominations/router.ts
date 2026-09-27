// Owner: Ojas (handed to Riley for #218) — nominate and majority-vote router.
import { Router } from "express";
import {
  CreateNominationRequest,
  EventNomination,
  EventNominationsResponse,
  RespondNominationRequest,
  VoteNominationRequest,
  routes,
} from "@web/contract";
import { requireAuth, type AuthedRequest } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { publicUserSelect, toPublicUser } from "../auth/helpers";
import { chatAccess, eventParticipants } from "../events/invitations";
import { nominationStore, type StoredNomination } from "./store";
import { createNomination, getEligibleSquadVoters, respondToNomination, voteOnNomination } from "./service";

export const nominationsRouter = Router();
nominationsRouter.use(requireAuth);

function mapNomination(nom: StoredNomination, nominee?: any): EventNomination {
  return EventNomination.parse({
    id: nom.id,
    event_id: nom.eventId,
    nominee_id: nom.nomineeId,
    nominee: nominee ? toPublicUser(nominee) : undefined,
    nominated_by_id: nom.nominatedById,
    status: nom.status,
    votes: nom.votes,
    threshold: nom.threshold,
    eligible_count: nom.eligibleCount,
    created_at: nom.createdAt.toISOString(),
    resolved_at: nom.resolvedAt?.toISOString() ?? null,
  });
}

nominationsRouter.get(routes.eventNominations(":id"), async (req, res) => {
  const me = (req as AuthedRequest).userId;
  const eventId = String(req.params.id);

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return res.status(404).json({ error: "not_found" });

  const participants = await eventParticipants(eventId);
  const eligibleVoters = getEligibleSquadVoters(event, participants);
  const isEligibleSquadMember = eligibleVoters.includes(me);
  const allNominations = nominationStore.getByEvent(eventId);

  // If not eligible squad member, caller can only see nominations where they are the nominee
  const visible = isEligibleSquadMember
    ? allNominations
    : allNominations.filter((n) => n.nomineeId === me);

  if (!isEligibleSquadMember && visible.length === 0) {
    return res.status(403).json({ error: "forbidden" });
  }

  const nomineeIds = [...new Set(visible.map((n) => n.nomineeId))];
  const nomineeUsers = await prisma.user.findMany({
    where: { id: { in: nomineeIds } },
    select: publicUserSelect,
  });
  const usersMap = new Map(nomineeUsers.map((u) => [u.id, u]));

  const mapped = visible.map((n) => mapNomination(n, usersMap.get(n.nomineeId)));
  res.json(EventNominationsResponse.parse({ nominations: mapped }));
});

nominationsRouter.post(routes.eventNominations(":id"), async (req, res) => {
  const me = (req as AuthedRequest).userId;
  const eventId = String(req.params.id);

  const body = CreateNominationRequest.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: "invalid_body", message: body.error.message });
  }

  const result = await createNomination(me, eventId, body.data.nominee_id);
  if (result.error || !result.nomination) {
    return res.status(result.status).json({ error: result.error });
  }

  const nominee = await prisma.user.findUnique({
    where: { id: result.nomination.nomineeId },
    select: publicUserSelect,
  });

  res.status(201).json(mapNomination(result.nomination, nominee));
});

nominationsRouter.post(routes.eventNominationVote(":id", ":nominationId"), async (req, res) => {
  const me = (req as AuthedRequest).userId;
  const eventId = String(req.params.id);
  const nominationId = String(req.params.nominationId);

  const body = VoteNominationRequest.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: "invalid_body", message: body.error.message });
  }

  const result = await voteOnNomination(me, eventId, nominationId);
  if (result.error || !result.nomination) {
    return res.status(result.status).json({ error: result.error });
  }

  const nominee = await prisma.user.findUnique({
    where: { id: result.nomination.nomineeId },
    select: publicUserSelect,
  });

  res.status(200).json(mapNomination(result.nomination, nominee));
});

nominationsRouter.post(routes.eventNominationRespond(":id", ":nominationId"), async (req, res) => {
  const me = (req as AuthedRequest).userId;
  const eventId = String(req.params.id);
  const nominationId = String(req.params.nominationId);

  const body = RespondNominationRequest.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: "invalid_body", message: body.error.message });
  }

  const result = await respondToNomination(me, eventId, nominationId, body.data.accept);
  if (result.error || !result.nomination) {
    return res.status(result.status).json({ error: result.error });
  }

  const nominee = await prisma.user.findUnique({
    where: { id: result.nomination.nomineeId },
    select: publicUserSelect,
  });

  res.status(200).json(mapNomination(result.nomination, nominee));
});
