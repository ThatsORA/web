// Owner: Ojas (handed to Andy for #212, updated for #347) — event group chat.
// Squad hangouts get chat from creation (voting, confirmed, chatted); all confirmed events get chat for
// attending members (confirmed, completed, chatted). Who is in it comes from chatAudience() in events/invitations.ts,
// the same rule as the card's `viewer.chat`: a Ghost Pass never enters, a visible Pass (creator, squad) keeps it,
// and direct invitees stay out of pre-close squad chats. Anyone outside it gets the same 403.
// Members can read until the messages are cleaned up; posting stops at endsAt (read-only).
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
import { publicUserSelect, toPublicUser } from "../auth/helpers";
import { chatAccess, chatAudience, eventParticipants } from "../events/invitations";
import { suggestToSender } from "./suggestion";

export const chatRouter = Router();
chatRouter.use(requireAuth);

chatRouter.get(routes.eventMessages(":id"), async (req, res) => {
  const me = (req as AuthedRequest).userId;
  const eventId = String(req.params.id);

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return res.status(404).json({ error: "not_found" });

  if (!chatAccess(event, await eventParticipants(eventId), me, new Date())) {
    return res.status(403).json({ error: "forbidden", message: "Chat isn't available to you for this event" });
  }

  const beforeQuery = req.query.before ? new Date(String(req.query.before)) : undefined;
  const beforeValid = beforeQuery && !isNaN(beforeQuery.getTime()) ? beforeQuery : undefined;

  const raw = await prisma.chatMessage.findMany({
    where: {
      eventId,
      ...(beforeValid ? { createdAt: { lt: beforeValid } } : {}),
    },
    include: {
      user: { select: publicUserSelect },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const nextCursor = raw.length === 50 ? raw[raw.length - 1]?.createdAt.toISOString() ?? null : null;
  const messages = raw
    .map((m) => {
      const author = toPublicUser(m.user);
      return {
        id: m.id,
        event_id: m.eventId,
        user_id: m.userId,
        username: author.username,
        display_name: author.display_name,
        body: m.body,
        created_at: m.createdAt.toISOString(),
      };
    })
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

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return res.status(404).json({ error: "not_found" });

  const participants = await eventParticipants(eventId);
  const access = chatAccess(event, participants, me, new Date());
  if (!access) {
    return res.status(403).json({ error: "forbidden", message: "Chat isn't available to you for this event" });
  }
  if (access === "read_only") {
    return res.status(400).json({ error: "chat_closed", message: "Chat is read-only after event ends" });
  }

  const user = await prisma.user.findUnique({
    where: { id: me },
    select: publicUserSelect,
  });
  if (!user) return res.status(404).json({ error: "user_not_found" });
  const author = toPublicUser(user);

  const created = await prisma.chatMessage.create({
    data: {
      eventId,
      userId: me,
      body: body.data.body,
    },
  });

  // Exactly the chat audience, minus the sender.
  const otherMembers = chatAudience(event.status, participants).filter((id) => id !== me);
  if (otherMembers.length > 0) {
    emitToUsers(otherMembers, "event:message", { event_id: eventId });
  }

  res.status(201).json(
    ChatMessage.parse({
      id: created.id,
      event_id: created.eventId,
      user_id: created.userId,
      username: author.username,
      display_name: author.display_name,
      body: created.body,
      created_at: created.createdAt.toISOString(),
    })
  );

  // After the response, so sending never waits on the model (#325).
  void suggestToSender(event, participants, me, created);
});
