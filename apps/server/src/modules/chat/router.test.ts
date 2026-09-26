import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eventFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  chatMessageFindMany: vi.fn(),
  chatMessageCreate: vi.fn(),
  emitToUsers: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    event: { findUnique: mocks.eventFindUnique },
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

import { chatRouter } from "./router";
import { signToken } from "../../lib/auth";

const userId = "6f48fb35-1518-481d-ab60-cfd2dcc28acf";
const friendId = "7a48fb35-1518-481d-ab60-cfd2dcc28ac0";
const ghostId = "8b48fb35-1518-481d-ab60-cfd2dcc28ac1";
const eventId = "3c48fb35-1518-481d-ab60-cfd2dcc28ac2";

const makeEvent = (overrides = {}) => ({
  id: eventId,
  status: "chatted",
  endsAt: new Date(Date.now() + 3600_000),
  participants: [
    { userId, voteStatus: "voted" },
    { userId: friendId, voteStatus: "voted" },
    { userId: ghostId, voteStatus: "ghost_passed" },
  ],
  ...overrides,
});

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
  mocks.userFindUnique.mockResolvedValue({ id: userId, username: "ojas" });
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
        body: "Hey everyone",
        created_at: msgTime.toISOString(),
      });
      expect(json.next_cursor).toBeNull();
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

    it("rejects reading when event is not chatted", async () => {
      mocks.eventFindUnique.mockResolvedValueOnce(makeEvent({ status: "voting" }));
      const res = await get();
      expect(res.status).toBe(400);
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

    it("rejects posting when event status is not chatted", async () => {
      mocks.eventFindUnique.mockResolvedValueOnce(makeEvent({ status: "voting" }));
      const res = await post({ body: "Hello" });
      expect(res.status).toBe(400);
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
});
