// Owner: Andy — event list + EventCardPayload assembly.
import { Router } from "express";
import express from "express";
import { CreateEventRequest } from "@web/contract";
import { withMatcherMutex, createUserHangout } from "../matching/matcher";
import { EventCardPayload, EventsListResponse, Id, routes } from "@web/contract";
import { requireAuth, type AuthedRequest } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { publicUserSelect } from "../auth/helpers";
import { resolveManualSelection } from "../matching/manualSelection";
import { assembleEventCard, canSeeEvent } from "./assembleEventCard";

export const eventsRouter = Router();

eventsRouter.post(routes.events, requireAuth, express.json(), async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const parsed = CreateEventRequest.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "bad_request" });

  const { invitee_ids, squad_ids, vibe_tag, earliest, latest } = parsed.data;
  const result = await withMatcherMutex(async () => {
    const [squads, friendships] = await Promise.all([
      squad_ids?.length ? prisma.explicitGroup.findMany({
        where: { id: { in: squad_ids } }, include: { members: true },
      }) : Promise.resolve([]),
      invitee_ids.length ? prisma.friendship.findMany({
        where: { OR: invitee_ids.map((invitee) => {
          const [userLowId, userHighId] = userId < invitee ? [userId, invitee] : [invitee, userId];
          return { userLowId, userHighId };
        }) },
      }) : Promise.resolve([]),
    ]);
    const selection = resolveManualSelection(userId, squad_ids ?? [], invitee_ids, squads, friendships);
    if ("error" in selection) return selection;
    return createUserHangout(userId, invitee_ids, vibe_tag, earliest, latest, selection);
  });
  if ("error" in result && ["invalid_squads", "invalid_invitees", "invalid_selection"].includes(result.error)) {
    return res.status(400).json({ error: result.error });
  }
  if ("error" in result && result.error === "already_open") return res.status(409).json({ error: result.error });
  // 422 no_common_time: no shared free window. 422 no_venues: missing home location or too few places.
  if ("error" in result) return res.status(422).json({ error: result.error });
  const eventId = result.eventId;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      participants: { include: { user: { select: publicUserSelect } } },
      options: true,
      votes: { select: { userId: true, optionId: true } },
    },
  });

  if (!event) return res.status(500).json({ error: "creation_failed" });

  res.status(201).json(EventCardPayload.parse(assembleEventCard(event, userId)));
});


eventsRouter.get(routes.events, requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const recentSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const events = await prisma.event.findMany({
    where: {
      participants: { some: { userId } },
      OR: [{ status: { in: ["voting", "confirmed"] } }, { endsAt: { gte: recentSince } }],
    },
    orderBy: { startsAt: "desc" },
    include: {
      participants: { include: { user: { select: publicUserSelect } } },
      options: true,
      votes: { select: { userId: true, optionId: true } },
    },
  });
  const now = new Date();
  res.json(EventsListResponse.parse({
    events: events.filter((event) => canSeeEvent(event, userId, now)).map((event) => assembleEventCard(event, userId, now)),
  }));
});

eventsRouter.get(routes.event(":id"), requireAuth, async (req, res) => {
  const id = Id.safeParse(req.params.id);
  if (!id.success) return res.status(404).json({ error: "not_found" });
  const userId = (req as AuthedRequest).userId;
  const event = await prisma.event.findFirst({
    where: { id: id.data, participants: { some: { userId } } },
    include: { participants: { include: { user: { select: publicUserSelect } } }, options: true, votes: { select: { userId: true, optionId: true } } },
  });
  // A ghost passer after close gets the same 404 as a stranger (#210).
  if (!event || !canSeeEvent(event, userId, new Date())) return res.status(404).json({ error: "not_found" });
  res.json(EventCardPayload.parse(assembleEventCard(event, userId)));
});
