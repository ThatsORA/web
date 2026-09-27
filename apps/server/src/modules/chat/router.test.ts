import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eventFindUnique: vi.fn(),
  participantFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  chatMessageFindMany: vi.fn(),
  chatMessageCreate: vi.fn(),
  emitToUsers: vi.fn(),
  askDecision: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    event: { findUnique: mocks.eventFindUnique },
    eventParticipant: { findMany: mocks.participantFindMany },
    user: { findUnique: mocks.userFindUnique },
    chatMessage: {
      findMany: mocks.chatMessageFindMany,
      create: mocks.chatMessageCreate,
    },
  },
}));

vi.mock("../../realtime", () => ({
  emitToUsers: mocks.emitToUsers,
}));

vi.mock("../intelligence/decision", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../intelligence/decision")>()),
  askDecision: mocks.askDecision,
}));

import { chatRouter } from "./router";
import { chatIntentRequest } from "../intelligence/decision";
import { signToken } from "../../lib/auth";

const userId = "6f48fb35-1518-481d-ab60-cfd2dcc28acf";
const friendId = "7a48fb35-1518-481d-ab60-cfd2dcc28ac0";
const ghostId = "8b48fb35-1518-481d-ab60-cfd2dcc28ac1";
const squadPasserId = "9c48fb35-1518-481d-ab60-cfd2dcc28ac3";
const eventId = "3c48fb35-1518-481d-ab60-cfd2dcc28ac2";

const makeEvent = (overrides = {}) => ({
  id: eventId,
  status: "chatted",
  endsAt: new Date(Date.now() + 3600_000),
  ...overrides,
});
// userId made the hangout and invited friendId and ghostId directly; ghostId passed (Ghost Pass).
const inEvent = (event: { createdById: string | null; sourceGroupId: string | null }, rows: { userId: string; voteStatus: string }[]) =>
  rows.map((row) => ({ ...row, event }));
const participants = inEvent({ createdById: userId, sourceGroupId: null }, [
  { userId, voteStatus: "voted" },
  { userId: friendId, voteStatus: "voted" },
  { userId: ghostId, voteStatus: "ghost_passed" },
]);
// A squad's hangout made by userId: friendId and squadPasserId came in with the squad; squadPasserId passed (visible Pass, #210).
const squadParticipants = inEvent({ createdById: userId, sourceGroupId: "s1" }, [
  { userId, voteStatus: "voted" },
  { userId: friendId, voteStatus: "voted" },
  { userId: squadPasserId, voteStatus: "ghost_passed" },
]);

let base: string;
let close: () => void;

beforeAll(async () => {
  const app = express();
  app.use(express.json(), chatRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/events/${eventId}/messages`;
  close = () => server.close();
});

afterAll(() => close());

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eventFindUnique.mockResolvedValue(makeEvent());
  mocks.participantFindMany.mockResolvedValue(participants);
  mocks.userFindUnique.mockResolvedValue({ id: userId, username: "ojas" });
  mocks.askDecision.mockReturnValue(new Promise(() => {})); // the model never answers unless a test says so
});

const get = (query = "", token = signToken(userId)) =>
  fetch(`${base}${query}`, {
    headers: { authorization: `Bearer ${token}` },
  });

const post = (body?: unknown, token = signToken(userId)) =>
  fetch(base, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const messageId1 = "11111111-1111-4111-8111-111111111111";
const messageId2 = "22222222-2222-4222-8222-222222222222";

describe("chatRouter", () => {
  describe("GET /events/:id/messages", () => {
    it("returns paged messages for active participants in a chatted event", async () => {
      const msgTime = new Date("2026-09-26T10:00:00.000Z");
      mocks.chatMessageFindMany.mockResolvedValueOnce([
        {
          id: messageId1,
          eventId,
          userId,
          body: "Hey everyone",
          createdAt: msgTime,
          user: { username: "ojas" },
        },
      ]);

      const res = await get();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.messages).toHaveLength(1);
      expect(json.messages[0]).toEqual({
        id: messageId1,
        event_id: eventId,
        user_id: userId,
        username: "ojas",
        display_name: "ojas",
        body: "Hey everyone",
        created_at: msgTime.toISOString(),
      });
      expect(json.next_cursor).toBeNull();
    });

    it("returns display_name from author's displayName when present", async () => {
      const msgTime = new Date("2026-09-26T10:00:00.000Z");
      mocks.chatMessageFindMany.mockResolvedValueOnce([
        {
          id: messageId1,
          eventId,
          userId,
          body: "Hey everyone",
          createdAt: msgTime,
          user: { username: "ojas", displayName: "Ojas Polakhare" },
        },
      ]);

      const res = await get();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.messages[0].display_name).toBe("Ojas Polakhare");
    });

    it("supports ?before= pagination cursor", async () => {
      const cursor = "2026-09-26T10:00:00.000Z";
      mocks.chatMessageFindMany.mockResolvedValueOnce([]);

      const res = await get(`?before=${encodeURIComponent(cursor)}`);
      expect(res.status).toBe(200);
      expect(mocks.chatMessageFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            eventId,
            createdAt: { lt: new Date(cursor) },
          },
          take: 50,
          orderBy: { createdAt: "desc" },
        })
      );
    });

    it("rejects non-participants with 403", async () => {
      const strangerId = "9948fb35-1518-481d-ab60-cfd2dcc28ac9";
      const res = await get("", signToken(strangerId));
      expect(res.status).toBe(403);
    });

    it("rejects ghost-passers with 403 (they opted out quietly)", async () => {
      const res = await get("", signToken(ghostId));
      expect(res.status).toBe(403);
    });

    it("lets a squad invitee who passed (visible Pass) keep reading", async () => {
      mocks.participantFindMany.mockResolvedValueOnce(squadParticipants);
      mocks.chatMessageFindMany.mockResolvedValueOnce([]);
      const res = await get("", signToken(squadPasserId));
      expect(res.status).toBe(200);
    });

    it("gives a direct-only hangout no chat while voting or after confirmation, with the same 403 as a stranger", async () => {
      for (const status of ["voting", "confirmed", "expired"]) {
        mocks.eventFindUnique.mockResolvedValueOnce(makeEvent({ status }));
        const res = await get();
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: "forbidden", message: "Chat isn't available to you for this event" });
      }
      expect(mocks.chatMessageFindMany).not.toHaveBeenCalled();
    });

    it("allows reading after endsAt (read-only mode)", async () => {
      mocks.eventFindUnique.mockResolvedValueOnce(
        makeEvent({ endsAt: new Date(Date.now() - 60_000) })
      );
      mocks.chatMessageFindMany.mockResolvedValueOnce([]);
      const res = await get();
      expect(res.status).toBe(200);
    });
  });

  describe("POST /events/:id/messages", () => {
    it("creates message, emits event:message to active participants, excludes ghost-passer", async () => {
      const now = new Date("2026-09-26T10:05:00.000Z");
      mocks.chatMessageCreate.mockResolvedValueOnce({
        id: messageId2,
        eventId,
        userId,
        body: "Where should we go instead?",
        createdAt: now,
      });

      const res = await post({ body: "Where should we go instead?" });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json).toEqual({
        id: messageId2,
        event_id: eventId,
        user_id: userId,
        username: "ojas",
        display_name: "ojas",
        body: "Where should we go instead?",
        created_at: now.toISOString(),
      });

      expect(mocks.chatMessageCreate).toHaveBeenCalledWith({
        data: {
          eventId,
          userId,
          body: "Where should we go instead?",
        },
      });

      // Emitted to friendId, but NOT to sender (userId) and NOT to ghost-passer (ghostId)
      expect(mocks.emitToUsers).toHaveBeenCalledWith(
        [friendId],
        "event:message",
        { event_id: eventId }
      );
    });

    it("uses displayName when sender has one set", async () => {
      mocks.userFindUnique.mockResolvedValue({ id: userId, username: "ojas", displayName: "Ojas Polakhare" });
      mocks.chatMessageCreate.mockResolvedValueOnce({
        id: messageId2,
        eventId,
        userId,
        body: "Where should we go instead?",
        createdAt: new Date("2026-09-26T10:05:00.000Z"),
      });

      const res = await post({ body: "Where should we go instead?" });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.display_name).toBe("Ojas Polakhare");
    });

    it("lets a squad invitee who passed (visible Pass) keep posting", async () => {
      mocks.participantFindMany.mockResolvedValueOnce(squadParticipants);
      mocks.userFindUnique.mockResolvedValueOnce({ id: squadPasserId, username: "sam" });
      mocks.chatMessageCreate.mockResolvedValueOnce({
        id: messageId2, eventId, userId: squadPasserId, body: "Can't make it, have fun", createdAt: new Date(),
      });
      const res = await post({ body: "Can't make it, have fun" }, signToken(squadPasserId));
      expect(res.status).toBe(201);
      expect(mocks.emitToUsers).toHaveBeenCalledWith([userId, friendId], "event:message", { event_id: eventId });
    });

    it("keeps the squad passer to the normal time limit (read-only after endsAt)", async () => {
      mocks.participantFindMany.mockResolvedValueOnce(squadParticipants);
      mocks.eventFindUnique.mockResolvedValueOnce(makeEvent({ endsAt: new Date(Date.now() - 60_000) }));
      const res = await post({ body: "Hello" }, signToken(squadPasserId));
      expect(res.status).toBe(400);
      expect(mocks.chatMessageCreate).not.toHaveBeenCalled();
    });

    it("rejects non-participants with 403", async () => {
      const strangerId = "9948fb35-1518-481d-ab60-cfd2dcc28ac9";
      const res = await post({ body: "Hello" }, signToken(strangerId));
      expect(res.status).toBe(403);
      expect(mocks.chatMessageCreate).not.toHaveBeenCalled();
    });

    it("rejects ghost-passers with 403", async () => {
      const res = await post({ body: "Hello" }, signToken(ghostId));
      expect(res.status).toBe(403);
      expect(mocks.chatMessageCreate).not.toHaveBeenCalled();
    });

    it("rejects posting in a direct-only hangout before it's chatted (403)", async () => {
      mocks.eventFindUnique.mockResolvedValueOnce(makeEvent({ status: "voting" }));
      const res = await post({ body: "Hello" });
      expect(res.status).toBe(403);
      expect(mocks.chatMessageCreate).not.toHaveBeenCalled();
    });

    it("rejects posting after endsAt (read-only)", async () => {
      mocks.eventFindUnique.mockResolvedValueOnce(
        makeEvent({ endsAt: new Date(Date.now() - 60_000) })
      );
      const res = await post({ body: "Hello" });
      expect(res.status).toBe(400);
      expect(mocks.chatMessageCreate).not.toHaveBeenCalled();
    });

    it("rejects empty or overlength bodies", async () => {
      expect((await post({ body: "" })).status).toBe(400);
      expect((await post({ body: "a".repeat(1001) })).status).toBe(400);
      expect(mocks.chatMessageCreate).not.toHaveBeenCalled();
    });
  });

  // #212: a squad hangout's chat is open from creation, stays open after confirmation, and goes read-only at endsAt.
  describe("squad hangout chat (#212)", () => {
    beforeEach(() => {
      mocks.participantFindMany.mockResolvedValue(squadParticipants);
      mocks.chatMessageFindMany.mockResolvedValue([]);
      mocks.chatMessageCreate.mockImplementation(async ({ data }) => ({ id: messageId2, ...data, createdAt: new Date() }));
    });

    for (const status of ["voting", "confirmed", "chatted"]) {
      it(`lets squad members read and post while ${status}, and sends event:message to exactly the chat audience`, async () => {
        mocks.eventFindUnique.mockResolvedValue(makeEvent({ status }));
        mocks.userFindUnique.mockResolvedValueOnce({ id: friendId, username: "riley" });
        expect((await get("", signToken(friendId))).status).toBe(200);
        const res = await post({ body: "Tacos?" }, signToken(friendId));
        expect(res.status).toBe(201);
        expect(mocks.emitToUsers).toHaveBeenCalledWith([userId, squadPasserId], "event:message", { event_id: eventId });
      });
    }

    it("lets a squad member who passed read and post while voting is still open", async () => {
      mocks.eventFindUnique.mockResolvedValue(makeEvent({ status: "voting" }));
      mocks.userFindUnique.mockResolvedValueOnce({ id: squadPasserId, username: "sam" });
      expect((await get("", signToken(squadPasserId))).status).toBe(200);
      expect((await post({ body: "Can't make it" }, signToken(squadPasserId))).status).toBe(201);
    });

    it("keeps a completed squad hangout readable but read-only after it ends", async () => {
      mocks.eventFindUnique.mockResolvedValue(makeEvent({ status: "completed", endsAt: new Date(Date.now() - 60_000) }));
      expect((await get("", signToken(friendId))).status).toBe(200);
      const res = await post({ body: "Fun night" }, signToken(friendId));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "chat_closed" });
      expect(mocks.chatMessageCreate).not.toHaveBeenCalled();
    });

    it("closes chat when a squad hangout expires", async () => {
      mocks.eventFindUnique.mockResolvedValue(makeEvent({ status: "expired" }));
      expect((await get("", signToken(friendId))).status).toBe(403);
      expect((await post({ body: "Hi" }, signToken(friendId))).status).toBe(403);
    });

    it("rejects a stranger while voting and after confirmation", async () => {
      const strangerId = "9948fb35-1518-481d-ab60-cfd2dcc28ac9";
      for (const status of ["voting", "confirmed"]) {
        mocks.eventFindUnique.mockResolvedValue(makeEvent({ status }));
        expect((await get("", signToken(strangerId))).status).toBe(403);
        expect((await post({ body: "Hi" }, signToken(strangerId))).status).toBe(403);
      }
      expect(mocks.chatMessageCreate).not.toHaveBeenCalled();
      expect(mocks.emitToUsers).not.toHaveBeenCalled();
    });
  });

  describe("direct invitees (#212)", () => {
    it("keeps a direct ghost passer out even while voting is open, when they could still return and vote", async () => {
      mocks.eventFindUnique.mockResolvedValue(makeEvent({ status: "voting", voteClosesAt: new Date(Date.now() + 60_000) }));
      expect((await get("", signToken(ghostId))).status).toBe(403);
      expect((await post({ body: "Hi" }, signToken(ghostId))).status).toBe(403);
    });

    it("never sends event:message to a direct ghost passer in the chatted fallback", async () => {
      mocks.chatMessageCreate.mockResolvedValueOnce({ id: messageId2, eventId, userId: friendId, body: "Hi", createdAt: new Date() });
      mocks.userFindUnique.mockResolvedValueOnce({ id: friendId, username: "riley" });
      expect((await post({ body: "Hi" }, signToken(friendId))).status).toBe(201);
      expect(mocks.emitToUsers).toHaveBeenCalledWith([userId], "event:message", { event_id: eventId });
    });
  });

  // #325: after a message is saved, its intent is classified in the background and offered to the sender only.
  describe("chat suggestions (#325)", () => {
    const intent = (top: string, p: number) => ({
      model: "jev-1.13.0",
      answers: { intent: { type: "choice", choice: top, confidence: p, probabilities: { [top]: p, just_chatting: 1 - p } } },
    });
    const suggestionEmits = () => mocks.emitToUsers.mock.calls.filter((c) => c[1] === "chat:suggestion");
    const settle = () => new Promise((resolve) => setImmediate(resolve));

    beforeEach(() => {
      mocks.participantFindMany.mockResolvedValue(squadParticipants);
      mocks.eventFindUnique.mockResolvedValue(makeEvent({ status: "voting", voteClosesAt: new Date(Date.now() + 60_000) }));
      mocks.userFindUnique.mockResolvedValue({ id: friendId, username: "riley" });
      mocks.chatMessageCreate.mockImplementation(async ({ data }) => ({ id: messageId2, ...data, createdAt: new Date() }));
    });

    it("sends the reply without waiting on the model", async () => {
      // beforeEach's askDecision never settles.
      const res = await post({ body: "ugh I can't make it" }, signToken(friendId));
      expect(res.status).toBe(201);
      expect(mocks.askDecision).toHaveBeenCalledWith(chatIntentRequest("ugh I can't make it"));
      expect(suggestionEmits()).toEqual([]);
    });

    it("offers Pass to the sender only", async () => {
      mocks.askDecision.mockResolvedValueOnce(intent("cant_make_it", 0.9));
      expect((await post({ body: "ugh I can't make it" }, signToken(friendId))).status).toBe(201);
      await vi.waitFor(() => expect(suggestionEmits()).toHaveLength(1));
      expect(suggestionEmits()[0]).toEqual([
        [friendId],
        "chat:suggestion",
        { event_id: eventId, message_id: messageId2, kind: "pass" },
      ]);
    });

    it("offers nothing once the sender can no longer pass", async () => {
      mocks.eventFindUnique.mockResolvedValue(makeEvent({ status: "chatted" }));
      mocks.askDecision.mockResolvedValueOnce(intent("cant_make_it", 0.9));
      expect((await post({ body: "ugh I can't make it" }, signToken(friendId))).status).toBe(201);
      await settle();
      expect(mocks.askDecision).toHaveBeenCalled();
      expect(suggestionEmits()).toEqual([]);
    });

    it("does nothing but log when the decision call fails", async () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.askDecision.mockRejectedValueOnce(new Error("Decision jev-1.13.0 503"));
      expect((await post({ body: "ugh I can't make it" }, signToken(friendId))).status).toBe(201);
      await vi.waitFor(() => expect(logged).toHaveBeenCalledWith("chat intent failed:", "Decision jev-1.13.0 503"));
      expect(suggestionEmits()).toEqual([]);
      logged.mockRestore();
    });
  });
});
