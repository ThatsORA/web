import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory friendships table plus users (A < B < U, so A is always the "low" side). U hasn't verified their email.
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const U = "33333333-3333-4333-8333-333333333333";
const verified = new Date();
const users = [
  { id: A, username: "andy", emailVerifiedAt: verified as Date | null },
  { id: B, username: "riley", emailVerifiedAt: verified as Date | null },
  { id: U, username: "uma", emailVerifiedAt: null as Date | null },
];
type Row = Record<string, unknown>;
type Where = Record<string, unknown>;
const mocks = vi.hoisted(() => ({ rows: [] as Row[], trigger: vi.fn(), emit: vi.fn() }));
const matches = (row: Row, where: Where): boolean =>
  Object.entries(where).every(([k, v]) =>
    k === "OR" ? (v as Where[]).some((w) => matches(row, w))
    : k === "userLowId_userHighId" ? matches(row, v as Where)
    : row[k] === v,
  );
const one = (where: Where) => mocks.rows.find((r) => matches(r, where)) ?? null;
const pub = (id: unknown) => {
  const u = users.find((x) => x.id === id);
  return u && { id: u.id, username: u.username, displayName: null };
};
const withUsers = (r: Row) => ({ ...r, userLow: pub(r.userLowId), userHigh: pub(r.userHighId) });
type UserWhere = { username?: string | { startsWith: string }; id?: string | { not: string } | { in: string[] }; emailVerifiedAt?: { not: null } };
const userMatches = (u: (typeof users)[number], w: UserWhere) =>
  (w.username === undefined || (typeof w.username === "string" ? u.username === w.username : u.username.startsWith(w.username.startsWith))) &&
  (w.id === undefined || (typeof w.id === "string" ? u.id === w.id : "not" in w.id ? u.id !== w.id.not : w.id.in.includes(u.id))) &&
  (w.emailVerifiedAt === undefined || u.emailVerifiedAt !== null);
// Returns more than any route should expose (email) so tests prove responses strip it.
const pick = (u: (typeof users)[number]) => ({ id: u.id, username: u.username, displayName: null, bio: null, email: `${u.username}@secret.test` });
vi.mock("../../lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => users.some((u) => u.id === where.id) ? { passwordChangedAt: null } : null,
      findFirst: async ({ where }: { where: UserWhere }) => {
        const u = users.find((x) => userMatches(x, where));
        return u ? pick(u) : null;
      },
      findMany: async ({ where }: { where: UserWhere }) => users.filter((u) => userMatches(u, where)).map(pick),
    },
    explicitGroup: { findMany: async () => [] },
    friendship: {
      findUnique: async ({ where }: { where: Where }) => one(where),
      findFirst: async ({ where }: { where: Where }) => one(where),
      findMany: async ({ where }: { where: Where }) => mocks.rows.filter((r) => matches(r, where)).map(withUsers),
      count: async ({ where }: { where: Where }) => mocks.rows.filter((r) => matches(r, where)).length,
      create: async ({ data }: { data: Row }) => {
        const row = { id: randomUUID(), status: "accepted", requestedById: null, requestedAt: new Date(), declinedAt: null, lowAddedHigh: false, highAddedLow: false, ...data };
        mocks.rows.push(row);
        return row;
      },
      update: async ({ where, data }: { where: Where; data: Row }) => Object.assign(one(where)!, data),
      delete: async ({ where }: { where: Where }) => mocks.rows.splice(mocks.rows.indexOf(one(where)!), 1)[0],
      deleteMany: async ({ where }: { where: Where }) => {
        const keep = mocks.rows.filter((r) => !matches(r, where));
        const count = mocks.rows.length - keep.length;
        mocks.rows.splice(0, mocks.rows.length, ...keep);
        return { count };
      },
    },
  },
}));
vi.mock("../matching/matcher", () => ({ triggerMatcher: mocks.trigger }));
vi.mock("../../realtime", () => ({ emitToUsers: mocks.emit }));
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
  mocks.rows.length = 0;
  mocks.trigger.mockReset().mockResolvedValue(undefined);
  mocks.emit.mockReset();
  users[2]!.emailVerifiedAt = null;
});
const as = (userId: string, path: string, init: { method?: string; body?: unknown } = {}) =>
  fetch(base + path, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", authorization: `Bearer ${signToken(userId)}` },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
const request = async (from: string, username: string) =>
  (await as(from, "/friends/requests", { method: "POST", body: { username } })).json();
const requests = async (userId: string) => (await as(userId, "/friends/requests")).json();
const addClose = (from: string, username: string) => as(from, "/friends/close", { method: "POST", body: { username } });
const befriend = async () => {
  await request(A, "riley");
  await request(B, "andy");
};

describe("friend requests", () => {
  it("A requests B: pending, B is told, A sees it outgoing and B incoming; repeats are no-ops", async () => {
    expect(await request(A, "riley")).toEqual({ status: "requested" });
    expect(await request(A, "riley")).toEqual({ status: "requested" });
    expect(mocks.rows).toHaveLength(1);
    expect(mocks.emit).toHaveBeenCalledExactlyOnceWith([B], "friend:request", { user_id: A });
    expect((await requests(A)).outgoing).toMatchObject([{ user: { id: B, username: "riley" } }]);
    expect((await requests(B)).incoming).toMatchObject([{ user: { id: A, username: "andy" } }]);
  });

  it("B accepts: friends on both sides, A is told; A can't accept their own request", async () => {
    await request(A, "riley");
    const id = (await requests(B)).incoming[0].id as string;
    expect((await as(A, `/friends/requests/${id}/accept`, { method: "POST" })).status).toBe(404);
    expect((await as(B, `/friends/requests/${id}/accept`, { method: "POST" })).status).toBe(204);
    expect(mocks.emit).toHaveBeenLastCalledWith([A], "friend:accepted", { user_id: B });
    expect(await (await as(A, "/friends")).json()).toEqual({ friends: [{ id: B, username: "riley", display_name: "riley", close: false }] });
    expect(await (await as(B, "/friends")).json()).toEqual({ friends: [{ id: A, username: "andy", display_name: "andy", close: false }] });
    expect(await requests(A)).toEqual({ incoming: [], outgoing: [] });
  });

  it("crossing requests auto-accept", async () => {
    await request(A, "riley");
    expect(await request(B, "andy")).toEqual({ status: "friends" });
    expect(mocks.rows[0]).toMatchObject({ status: "accepted" });
  });

  it("decline is silent: gone from B's inbox, still pending to A, no event", async () => {
    await request(A, "riley");
    const id = (await requests(B)).incoming[0].id as string;
    mocks.emit.mockReset();
    expect((await as(B, `/friends/requests/${id}`, { method: "DELETE" })).status).toBe(204);
    expect((await requests(B)).incoming).toEqual([]);
    expect((await requests(A)).outgoing).toHaveLength(1);
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it("cancel deletes the request", async () => {
    await request(A, "riley");
    const id = (await requests(A)).outgoing[0].id as string;
    expect((await as(A, `/friends/requests/${id}`, { method: "DELETE" })).status).toBe(204);
    expect(mocks.rows).toHaveLength(0);
  });

  it("caps pending outgoing requests at 50", async () => {
    for (let i = 0; i < 50; i++) mocks.rows.push({ id: randomUUID(), userLowId: A, userHighId: randomUUID(), status: "pending", requestedById: A });
    expect((await as(A, "/friends/requests", { method: "POST", body: { username: "riley" } })).status).toBe(429);
  });

  it("rejects self-requests, unknown users and bad bodies", async () => {
    expect((await as(A, "/friends/requests", { method: "POST", body: { username: "andy" } })).status).toBe(400);
    expect((await as(A, "/friends/requests", { method: "POST", body: { username: "nobody" } })).status).toBe(404);
    expect((await as(A, "/friends/requests", { method: "POST", body: {} })).status).toBe(400);
  });
});

describe("close friends (accepted friends only)", () => {
  it("409 with no friendship or a pending one, and no matcher run", async () => {
    expect((await addClose(A, "riley")).status).toBe(409);
    await request(A, "riley");
    expect((await addClose(A, "riley")).status).toBe(409);
    expect((await as(A, `/friends/close/${B}`, { method: "DELETE" })).status).toBe(409);
    expect(mocks.trigger).not.toHaveBeenCalled();
  });

  it("A marks B: 204 with no signal, only A's flag shows, matcher not triggered", async () => {
    await befriend();
    const res = await addClose(A, "riley");
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(mocks.rows[0]).toMatchObject({ lowAddedHigh: true, highAddedLow: false });
    expect(mocks.trigger).not.toHaveBeenCalled();
    expect(await (await as(B, "/friends")).json()).toEqual({ friends: [{ id: A, username: "andy", display_name: "andy", close: false }] });
  });

  it("B marks A back: mutual triggers the matcher once; GET /friends/close has no mutual signal", async () => {
    await befriend();
    await addClose(A, "riley");
    await addClose(B, "andy");
    await addClose(B, "andy");
    expect(mocks.trigger).toHaveBeenCalledOnce();
    expect(await (await as(A, "/friends/close")).json()).toEqual({ friends: [{ id: B, username: "riley", display_name: "riley" }] });
  });

  it("unfriending deletes the row, clearing both flags", async () => {
    await befriend();
    await addClose(A, "riley");
    await addClose(B, "andy");
    expect((await as(B, `/friends/${A}`, { method: "DELETE" })).status).toBe(204);
    expect(mocks.rows).toHaveLength(0);
    expect(await (await as(A, "/friends/close")).json()).toEqual({ friends: [] });
    expect((await addClose(A, "riley")).status).toBe(409);
  });
});

describe("search", () => {
  it("excludes self and returns only id + username", async () => {
    const res = await as(A, "/users/search?q=R");
    expect(await res.json()).toEqual({ users: [{ id: B, username: "riley", display_name: "riley" }] });
    expect(await (await as(A, "/users/search?q=")).json()).toEqual({ users: [] });
  });
});

describe("unverified accounts (EMAIL_VERIFICATION_REQUIRED)", () => {
  it("can't be found, requested or marked close", async () => {
    expect(await (await as(A, "/users/search?q=u")).json()).toEqual({ users: [] });
    expect((await as(A, "/friends/requests", { method: "POST", body: { username: "uma" } })).status).toBe(404);
    expect((await addClose(A, "uma")).status).toBe(404);
  });

  it("can send requests, but they stay hidden and unacceptable until they verify", async () => {
    await request(U, "andy");
    expect((await requests(A)).incoming).toEqual([]);
    const id = mocks.rows[0]!.id as string;
    expect((await as(A, `/friends/requests/${id}/accept`, { method: "POST" })).status).toBe(404);
    users[2]!.emailVerifiedAt = new Date();
    expect((await requests(A)).incoming).toMatchObject([{ user: { id: U, username: "uma" } }]);
    expect((await as(A, `/friends/requests/${id}/accept`, { method: "POST" })).status).toBe(204);
  });
});

describe("public profile", () => {
  const profile = async (viewer: string, id: string) => as(viewer, `/users/${id}`);

  it("shows name, bio and friendship from my side; never email or close-friend status", async () => {
    expect(await (await profile(A, B)).json()).toEqual({ id: B, username: "riley", display_name: "riley", bio: null, friendship: "none", squads: [] });
    await request(A, "riley");
    expect((await (await profile(A, B)).json()).friendship).toBe("requested");
    expect((await (await profile(B, A)).json()).friendship).toBe("incoming");
    await request(B, "andy");
    await addClose(B, "andy");
    const body = await (await profile(A, B)).json();
    expect(body.friendship).toBe("friends");
    expect(JSON.stringify(body)).not.toMatch(/secret|close|mutual|added/i);
  });

  it("404s unverified accounts (except to themselves)", async () => {
    expect((await profile(A, U)).status).toBe(404);
    expect((await profile(U, U)).status).toBe(200);
  });
});
