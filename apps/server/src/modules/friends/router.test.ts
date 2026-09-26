import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory friendships table keyed by "low|high", plus two users.
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const users = [{ id: A, username: "andy" }, { id: B, username: "riley" }];
const mocks = vi.hoisted(() => ({ rows: new Map<string, Record<string, unknown>>(), trigger: vi.fn() }));
type Key = { userLowId_userHighId: { userLowId: string; userHighId: string } };
const k = ({ userLowId_userHighId: p }: Key) => `${p.userLowId}|${p.userHighId}`;
vi.mock("../../lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { username: string } }) => users.find((u) => u.username === where.username) ?? null,
      findMany: async ({ where }: { where: { username: { startsWith: string }; id: { not: string } } }) =>
        users.filter((u) => u.username.startsWith(where.username.startsWith) && u.id !== where.id.not),
    },
    friendship: {
      findUnique: async ({ where }: { where: Key }) => mocks.rows.get(k(where)) ?? null,
      upsert: async ({ where, create, update }: { where: Key; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const row = { lowAddedHigh: false, highAddedLow: false, ...(mocks.rows.get(k(where)) ?? create), ...update };
        mocks.rows.set(k(where), row);
        return row;
      },
    },
  },
}));
vi.mock("../matching/matcher", () => ({ triggerMatcher: mocks.trigger }));
import { friendsRouter } from "./router";
import { signToken } from "../../lib/auth";

let base: string;
let close: () => void;
beforeAll(async () => {
  const app = express();
  app.use(express.json(), friendsRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => close());
beforeEach(() => {
  mocks.rows.clear();
  mocks.trigger.mockReset().mockResolvedValue(undefined);
});
const as = (userId: string, path: string, init: { method?: string; body?: unknown } = {}) =>
  fetch(base + path, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", authorization: `Bearer ${signToken(userId)}` },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

describe("close-friend handshake", () => {
  it("A adds B: not mutual, no signal to A, matcher not triggered", async () => {
    const res = await as(A, "/friends/close", { method: "POST", body: { username: "riley" } });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(mocks.rows.get(`${A}|${B}`)).toMatchObject({ lowAddedHigh: true, highAddedLow: false });
    expect(mocks.trigger).not.toHaveBeenCalled();
  });

  it("B adds A back: mutual, matcher triggered exactly once (repeat adds are no-ops)", async () => {
    await as(A, "/friends/close", { method: "POST", body: { username: "riley" } });
    await as(B, "/friends/close", { method: "POST", body: { username: "andy" } });
    await as(B, "/friends/close", { method: "POST", body: { username: "andy" } });
    expect(mocks.rows.get(`${A}|${B}`)).toMatchObject({ lowAddedHigh: true, highAddedLow: true });
    expect(mocks.trigger).toHaveBeenCalledOnce();
  });

  it("rejects self-adds, unknown users and bad bodies", async () => {
    expect((await as(A, "/friends/close", { method: "POST", body: { username: "andy" } })).status).toBe(400);
    expect((await as(A, "/friends/close", { method: "POST", body: { username: "nobody" } })).status).toBe(404);
    expect((await as(A, "/friends/close", { method: "POST", body: {} })).status).toBe(400);
  });

  it("search excludes self and returns only id + username", async () => {
    const res = await as(A, "/users/search?q=R");
    expect(await res.json()).toEqual({ users: [{ id: B, username: "riley" }] });
    expect(await (await as(A, "/users/search?q=")).json()).toEqual({ users: [] });
  });
});
