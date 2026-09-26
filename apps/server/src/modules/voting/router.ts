// Owner: Ojas — votes + Ghost Pass (plan §9). Never expose who voted for what.
import { Router, type Request, type Response } from "express";
import { routes, VoteRequest } from "@web/contract";
import { requireAuth, type AuthedRequest } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { afterResponse } from "./lifecycle";

export const votingRouter = Router();

/** The caller's open event, or null after sending 404/409. 404 also hides events you're not in. */
async function openEventFor(req: Request, res: Response) {
  const userId = (req as AuthedRequest).userId;
  const event = await prisma.event.findUnique({
    where: { id: String(req.params.id) },
    include: { participants: { where: { userId } }, options: { select: { id: true } } },
  });
  if (!event || event.participants.length === 0) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  if (event.status !== "voting" || event.voteClosesAt <= new Date()) {
    res.status(409).json({ error: "voting_closed" });
    return null;
  }
  return { event, userId };
}

votingRouter.post(routes.vote(":id"), requireAuth, async (req, res) => {
  const body = VoteRequest.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "invalid_body", message: body.error.message });
  const found = await openEventFor(req, res);
  if (!found) return;
  const { event, userId } = found;
  if (!event.options.some((o) => o.id === body.data.option_id)) return res.status(400).json({ error: "unknown_option" });

  await prisma.$transaction([
    prisma.vote.upsert({
      where: { eventId_userId: { eventId: event.id, userId } },
      create: { eventId: event.id, userId, optionId: body.data.option_id },
      update: { optionId: body.data.option_id, castAt: new Date() },
    }),
    prisma.eventParticipant.update({
      where: { eventId_userId: { eventId: event.id, userId } },
      data: { voteStatus: "voted" },
    }),
  ]);
  await afterResponse(event.id);
  res.status(204).end();
});

votingRouter.post(routes.ghostPass(":id"), requireAuth, async (req, res) => {
  const found = await openEventFor(req, res);
  if (!found) return;
  const { event, userId } = found;

  await prisma.$transaction([
    prisma.vote.deleteMany({ where: { eventId: event.id, userId } }),
    prisma.eventParticipant.update({
      where: { eventId_userId: { eventId: event.id, userId } },
      data: { voteStatus: "ghost_passed" },
    }),
  ]);
  await afterResponse(event.id);
  res.status(204).end();
});
