import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "@web/contract";
import { signToken } from "../../lib/auth";

const mockPrisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(async () => ({ passwordChangedAt: null })),
  },
  pushToken: {
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));

import { authRouter } from "./router";

let base: string;
let close: () => void;
const userId = "c8942b08-3e91-4cfa-9310-4f51fae9295a";

beforeAll(async () => {
  const app = express();
  app.use(express.json(), authRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});

afterAll(() => close());
beforeEach(() => vi.clearAllMocks());

const call = (method: string, path: string, body?: unknown, auth = false) =>
  fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(auth ? { authorization: `Bearer ${signToken(userId)}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("auth router - push token endpoints", () => {
  describe("PUT /me/push-token", () => {
    it("requires auth", async () => {
      const res = await call("PUT", "/me/push-token", { token: "ExponentPushToken[abc]" });
      expect(res.status).toBe(401);
      expect(mockPrisma.pushToken.upsert).not.toHaveBeenCalled();
    });

    it("rejects invalid body (empty token) with 400", async () => {
      const res = await call("PUT", "/me/push-token", { token: "" }, true);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_body" });
      expect(mockPrisma.pushToken.upsert).not.toHaveBeenCalled();
    });

    it("rejects invalid platform with 400", async () => {
      const res = await call(
        "PUT",
        "/me/push-token",
        { token: "ExponentPushToken[abc]", platform: "windows" },
        true,
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_body" });
      expect(mockPrisma.pushToken.upsert).not.toHaveBeenCalled();
    });

    it("upserts token with default platform 'ios' and returns 204", async () => {
      mockPrisma.pushToken.upsert.mockResolvedValueOnce({
        id: "pt-1",
        userId,
        token: "ExponentPushToken[abc]",
        platform: "ios",
        createdAt: new Date(),
      });

      const res = await call("PUT", "/me/push-token", { token: "ExponentPushToken[abc]" }, true);
      expect(res.status).toBe(204);
      expect(mockPrisma.pushToken.upsert).toHaveBeenCalledWith({
        where: { token: "ExponentPushToken[abc]" },
        create: {
          userId,
          token: "ExponentPushToken[abc]",
          platform: "ios",
        },
        update: {
          userId,
          platform: "ios",
        },
      });
    });

    it("upserts token with specified platform 'android' and returns 204", async () => {
      mockPrisma.pushToken.upsert.mockResolvedValueOnce({
        id: "pt-2",
        userId,
        token: "ExponentPushToken[def]",
        platform: "android",
        createdAt: new Date(),
      });

      const res = await call(
        "PUT",
        "/me/push-token",
        { token: "ExponentPushToken[def]", platform: "android" },
        true,
      );
      expect(res.status).toBe(204);
      expect(mockPrisma.pushToken.upsert).toHaveBeenCalledWith({
        where: { token: "ExponentPushToken[def]" },
        create: {
          userId,
          token: "ExponentPushToken[def]",
          platform: "android",
        },
        update: {
          userId,
          platform: "android",
        },
      });
    });

    it("works when accessing via routes.pushToken", async () => {
      mockPrisma.pushToken.upsert.mockResolvedValueOnce({});
      const res = await call("PUT", routes.pushToken, { token: "ExponentPushToken[xyz]" }, true);
      expect(res.status).toBe(204);
      expect(mockPrisma.pushToken.upsert).toHaveBeenCalled();
    });
  });

  describe("DELETE /me/push-token", () => {
    it("requires auth", async () => {
      const res = await call("DELETE", "/me/push-token", { token: "ExponentPushToken[abc]" });
      expect(res.status).toBe(401);
      expect(mockPrisma.pushToken.deleteMany).not.toHaveBeenCalled();
    });

    it("rejects invalid body with 400", async () => {
      const res = await call("DELETE", "/me/push-token", {}, true);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_body" });
      expect(mockPrisma.pushToken.deleteMany).not.toHaveBeenCalled();
    });

    it("deletes user's token and returns 204", async () => {
      mockPrisma.pushToken.deleteMany.mockResolvedValueOnce({ count: 1 });
      const res = await call("DELETE", "/me/push-token", { token: "ExponentPushToken[abc]" }, true);
      expect(res.status).toBe(204);
      expect(mockPrisma.pushToken.deleteMany).toHaveBeenCalledWith({
        where: {
          userId,
          token: "ExponentPushToken[abc]",
        },
      });
    });

    it("works when accessing via routes.pushToken", async () => {
      mockPrisma.pushToken.deleteMany.mockResolvedValueOnce({ count: 1 });
      const res = await call("DELETE", routes.pushToken, { token: "ExponentPushToken[abc]" }, true);
      expect(res.status).toBe(204);
      expect(mockPrisma.pushToken.deleteMany).toHaveBeenCalled();
    });
  });
});
