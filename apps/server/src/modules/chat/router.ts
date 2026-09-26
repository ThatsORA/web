// Owner: Ojas — fallback group chat for chatted events.
// Only participants may read or post; ghost-passers are excluded.
// Posting only works while Event.status === "chatted" and before endsAt.
import { Router } from "express";
import {
  ChatMessage,
  ChatMessagesResponse,
  routes,
  SendChatMessageRequest,
} from "@web/contract";
import { requireAuth, type AuthedRequest } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { emitToUsers } from "../../realtime";

export const chatRouter = Router();
chatRouter.use(requireAuth);

chatRouter.get(routes.eventMessages(":id"), async (req, res) => {
  const me = (req as AuthedRequest).userId;
  const eventId = String(req.params.id);

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      participants: { select: { userId: true, voteStatus: true } },
    },
  });
  if (!event) return res.status(404).json({ error: "not_found" });

  const participant = event.participants.find((p) => p.userId === me);
  if (!participant || participant.voteStatus === "ghost_passed") {
    return res.status(403).json({ error: "forbidden", message: "Only active participants may read chat" });
  }

  if (event.status !== "chatted") {
    return res.status(400).json({ error: "chat_closed", message: "Chat is only available for chatted events" });
  }

  const beforeQuery = req.query.before ? new Date(String(req.query.before)) : undefined;
  const beforeValid = beforeQuery && !isNaN(beforeQuery.getTime()) ? beforeQuery : undefined;

  const raw = await prisma.chatMessage.findMany({
    where: {
      eventId,
      ...(beforeValid ? { createdAt: { lt: beforeValid } } : {}),
    },
    include: {
      user: { select: { username: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const nextCursor = raw.length === 50 ? raw[raw.length - 1]?.createdAt.toISOString() ?? null : null;
  const messages = raw
    .map((m) => ({
      id: m.id,
      event_id: m.eventId,
      user_id: m.userId,
      username: m.user.username,
      body: m.body,
      created_at: m.createdAt.toISOString(),
    }))
    .reverse();

  res.json(ChatMessagesResponse.parse({ messages, next_cursor: nextCursor }));
});

chatRouter.post(routes.eventMessages(":id"), async (req, res) => {
  const me = (req as AuthedRequest).userId;
  const eventId = String(req.params.id);

  const body = SendChatMessageRequest.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: "invalid_body", message: body.error.message });
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      participants: { select: { userId: true, voteStatus: true } },
    },
  });
  if (!event) return res.status(404).json({ error: "not_found" });

  const participant = event.participants.find((p) => p.userId === me);
  if (!participant || participant.voteStatus === "ghost_passed") {
    return res.status(403).json({ error: "forbidden", message: "Only active participants may post in chat" });
  }

  const now = new Date();
  if (event.status !== "chatted") {
    return res.status(400).json({ error: "chat_closed", message: "Posting is only allowed when event is chatted" });
  }
  if (now >= event.endsAt) {
    return res.status(400).json({ error: "chat_closed", message: "Chat is read-only after event ends" });
  }

  const user = await prisma.user.findUnique({
    where: { id: me },
    select: { username: true },
  });
  if (!user) return res.status(404).json({ error: "user_not_found" });

  const created = await prisma.chatMessage.create({
    data: {
      eventId,
      userId: me,
      body: body.data.body,
    },
  });

  const otherActiveUserIds = event.participants
    .filter((p) => p.userId !== me && p.voteStatus !== "ghost_passed")
    .map((p) => p.userId);

  if (otherActiveUserIds.length > 0) {
    emitToUsers(otherActiveUserIds, "event:message", { event_id: eventId });
  }

  res.status(201).json(
    ChatMessage.parse({
      id: created.id,
      event_id: created.eventId,
      user_id: created.userId,
      username: user.username,
      body: created.body,
      created_at: created.createdAt.toISOString(),
    })
  );
});
