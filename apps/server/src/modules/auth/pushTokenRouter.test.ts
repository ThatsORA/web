import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ upsert: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn() }));
vi.mock("../../lib/prisma", () => ({
  prisma: { pushToken: mocks, user: { findUnique: mocks.findUnique } },
}));

import { signToken } from "../../lib/auth";
import { pushTokenRouter } from "./pushTokenRouter";

const userId = "6f48fb35-1518-481d-ab60-cfd2dcc28acf";
const token = "ExponentPushToken[device-token]";
let base: string;
let close: () => void;

beforeAll(async () => {
  const app = express();
  app.use(express.json(), pushTokenRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => close());
beforeEach(() => {
  vi.clearAllMocks();
  // Forward-compatible with #92, where requireAuth checks passwordChangedAt.
  mocks.findUnique.mockResolvedValue({ passwordChangedAt: null });
});

function call(method: string, body: unknown, auth = true) {
  return fetch(`${base}/me/push-token`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(auth ? { authorization: `Bearer ${signToken(userId)}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("push-token router", () => {
  it("requires authentication", async () => {
    expect((await call("PUT", { token, platform: "ios" }, false)).status).toBe(401);
    expect((await call("DELETE", { token }, false)).status).toBe(401);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects invalid token registration bodies before DB access", async () => {
    expect((await call("PUT", { token: "", platform: "ios" })).status).toBe(400);
    expect((await call("PUT", { token: "not-an-expo-token", platform: "ios" })).status).toBe(400);
    expect((await call("PUT", { token, platform: "web" })).status).toBe(400);
    expect((await call("DELETE", {})).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("upserts by unique token and deliberately transfers ownership on account switch", async () => {
    const response = await call("PUT", { token, platform: "android" });
    expect(response.status).toBe(204);
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { token },
      create: { userId, token, platform: "android" },
      update: { userId, platform: "android" },
    });
  });

  it("deletes only the authenticated user's matching token", async () => {
    const response = await call("DELETE", { token });
    expect(response.status).toBe(204);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { userId, token } });
  });
});
