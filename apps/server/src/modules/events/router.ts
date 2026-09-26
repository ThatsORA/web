// Owner: Andy — event list + EventCardPayload assembly.
import { Router } from "express";
import { EventCardPayload, EventsListResponse, Id, routes } from "@web/contract";
import { requireAuth, type AuthedRequest } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { assembleEventCard } from "./assembleEventCard";

export const eventsRouter = Router();

eventsRouter.get(routes.events, requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const recentSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const events = await prisma.event.findMany({
    where: {
      participants: { some: { userId } },
      OR: [{ status: { in: ["voting", "confirmed"] } }, { endsAt: { gte: recentSince } }],
    },
    orderBy: { startsAt: "desc" },
    select: { id: true, status: true, startsAt: true, vibeTag: true },
  });
  res.json(EventsListResponse.parse({
    events: events.map((event) => ({
      id: event.id,
      status: event.status,
      starts_at: event.startsAt.toISOString(),
      vibe_tag: event.vibeTag,
    })),
  }));
});

eventsRouter.get(routes.event(":id"), requireAuth, async (req, res) => {
  const id = Id.safeParse(req.params.id);
  if (!id.success) return res.status(404).json({ error: "not_found" });
  const userId = (req as AuthedRequest).userId;
  const event = await prisma.event.findFirst({
    where: { id: id.data, participants: { some: { userId } } },
    include: { participants: { include: { user: { select: { id: true, username: true } } } }, options: true, votes: { select: { userId: true, optionId: true } } },
  });
  if (!event) return res.status(404).json({ error: "not_found" });
  res.json(EventCardPayload.parse(assembleEventCard(event, userId)));
});
