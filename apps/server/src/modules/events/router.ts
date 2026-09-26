// Owner: Andy — event list + EventCardPayload assembly.
import { Router } from "express";
import express from "express";
import { CreateEventRequest } from "@web/contract";
import { withMatcherMutex, createUserHangout } from "../matching/matcher";
import { EventCardPayload, EventsListResponse, Id, routes } from "@web/contract";
import { requireAuth, type AuthedRequest } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { assembleEventCard } from "./assembleEventCard";

export const eventsRouter = Router();

eventsRouter.post(routes.events, requireAuth, express.json(), async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const parsed = CreateEventRequest.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "bad_request" });

  const { invitee_ids, vibe_tag, earliest, latest } = parsed.data;

  if (invitee_ids.includes(userId)) {
    return res.status(400).json({ error: "invalid_invitees" });
  }

  const friendships = await prisma.friendship.findMany({
    where: {
      OR: invitee_ids.map(invitee => {
        const [low, high] = userId < invitee ? [userId, invitee] : [invitee, userId];
        return { userLowId: low, userHighId: high };
      })
    }
  });

  const valid = invitee_ids.every(invitee => {
    const [low, high] = userId < invitee ? [userId, invitee] : [invitee, userId];
    const friendship = friendships.find(f => f.userLowId === low && f.userHighId === high);
    if (!friendship) return false;
    if ('status' in friendship && (friendship as any).status !== "accepted") return false;
    return userId === low ? friendship.lowAddedHigh : friendship.highAddedLow;
  });

  if (!valid) return res.status(400).json({ error: "invalid_invitees" });

  const eventId = await withMatcherMutex(() => createUserHangout(userId, invitee_ids, vibe_tag, earliest, latest));

  if (!eventId) {
    return res.status(422).json({ error: "no_common_time" });
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      participants: { include: { user: { select: { id: true, username: true } } } },
      options: true,
      creator: { select: { id: true, username: true } },
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
      participants: { include: { user: { select: { id: true, username: true } } } },
      options: true, creator: { select: { id: true, username: true } },
      votes: { select: { userId: true, optionId: true } },
    },
  });
  res.json(EventsListResponse.parse({
    events: events.map((event) => assembleEventCard(event, userId)),
  }));
});

eventsRouter.get(routes.event(":id"), requireAuth, async (req, res) => {
  const id = Id.safeParse(req.params.id);
  if (!id.success) return res.status(404).json({ error: "not_found" });
  const userId = (req as AuthedRequest).userId;
  const event = await prisma.event.findFirst({
    where: { id: id.data, participants: { some: { userId } } },
    include: { participants: { include: { user: { select: { id: true, username: true } } } }, options: true, creator: { select: { id: true, username: true } }, votes: { select: { userId: true, optionId: true } } },
  });
  if (!event) return res.status(404).json({ error: "not_found" });
  res.json(EventCardPayload.parse(assembleEventCard(event, userId)));
});
