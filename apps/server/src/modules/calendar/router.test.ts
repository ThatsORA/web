import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BusyBlock } from "@prisma/client";
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(), transaction: vi.fn(), trigger: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), googleCalendarDelete: vi.fn(), fetch: vi.fn(), signState: vi.fn(), verifyState: vi.fn(), encryptToken: vi.fn(), decryptToken: vi.fn(), userFindUnique: vi.fn(), eventFindMany: vi.fn(), busyBlockFindFirst: vi.fn(), busyBlockCreate: vi.fn(), busyBlockDelete: vi.fn() }));
vi.mock("../../lib/prisma", () => ({ prisma: { user: { findUnique: mocks.userFindUnique }, event: { findMany: mocks.eventFindMany }, $transaction: mocks.transaction, googleCalendarConnection: { findUnique: mocks.findUnique, upsert: mocks.upsert, delete: mocks.googleCalendarDelete }, busyBlock: { findMany: mocks.findMany, findFirst: mocks.busyBlockFindFirst, create: mocks.busyBlockCreate, delete: mocks.busyBlockDelete } } }));
vi.mock("../matching/matcher", () => ({ triggerMatcher: mocks.trigger }));
vi.mock("./crypto", () => ({
  signState: mocks.signState,
  verifyState: mocks.verifyState,
  encryptToken: mocks.encryptToken,
  decryptToken: mocks.decryptToken
}));
import { calendarRouter } from "./router";
import { signToken } from "../../lib/auth";
import { freeWindows } from "../matching/timeMath";
let base: string;
let close: () => void;
const userId = "6f48fb35-1518-481d-ab60-cfd2dcc28acf";
const body = { horizon_start: "2026-09-26T12:00:00Z", horizon_end: "2026-10-03T12:00:00Z", blocks: [{ starts_at: "2026-09-27T12:00:00Z", ends_at: "2026-09-27T13:00:00Z" }] };
beforeAll(async () => {
  const app = express();
  app.use(express.json(), calendarRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/busy-blocks`;
  close = () => server.close();
});
afterAll(() => close());
beforeEach(() => {
  vi.clearAllMocks();
  mocks.userFindUnique.mockResolvedValue({ passwordChangedAt: null });
  mocks.findMany.mockResolvedValue([]);
  mocks.deleteMany.mockResolvedValue({ count: 0 });
  mocks.createMany.mockResolvedValue({ count: 1 });
  mocks.trigger.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(async callback => callback({ busyBlock: { findMany: mocks.findMany, deleteMany: mocks.deleteMany, createMany: mocks.createMany }, googleCalendarConnection: { delete: mocks.googleCalendarDelete } }));
});
const put = (payload: unknown, auth = true) => fetch(base, { method: "PUT", headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${signToken(userId)}` } : {}) }, body: JSON.stringify(payload) });
describe("PUT busy-blocks", () => {
  it("requires authentication and validates the contract before accessing DB", async () => {
    expect((await put(body, false)).status).toBe(401);
    expect((await put({})).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rejects reversed horizons, reversed blocks and out-of-horizon blocks", async () => {
    for (const invalid of [
      { ...body, horizon_end: body.horizon_start },
      { ...body, blocks: [{ starts_at: body.horizon_end, ends_at: body.horizon_start }] },
      { ...body, blocks: [{ starts_at: "2026-09-25T12:00:00Z", ends_at: body.horizon_end }] },
    ]) expect((await put(invalid)).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("replaces only caller overlaps in one transaction, strips extra fields and deduplicates", async () => {
    const response = await put({ ...body, blocks: [{ ...body.blocks[0], title: "private" }, body.blocks[0]] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ stored: 1 });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { userId, source: "device_calendar", startsAt: { lt: new Date(body.horizon_end) }, endsAt: { gt: new Date(body.horizon_start) } } });
    expect(mocks.createMany).toHaveBeenCalledWith({ data: [{ userId, source: "device_calendar", startsAt: new Date(body.blocks[0]!.starts_at), endsAt: new Date(body.blocks[0]!.ends_at) }] });
    expect(mocks.trigger).not.toHaveBeenCalled(); // auto-proposals off (#196)
  });
  it("preserves both portions of a block crossing the horizon", async () => {
    const existing: BusyBlock = { id: "old", userId, source: "seed", startsAt: new Date("2026-09-25T00:00:00Z"), endsAt: new Date("2026-10-04T00:00:00Z"), syncedAt: new Date("2026-09-24T00:00:00Z") };
    mocks.findMany.mockResolvedValue([existing]);
    expect((await put({ ...body, blocks: [] })).status).toBe(200);
    const { id: _id, ...baseBlock } = existing;
    expect(mocks.createMany).toHaveBeenCalledWith({ data: [{ ...baseBlock, endsAt: new Date(body.horizon_start) }, { ...baseBlock, startsAt: new Date(body.horizon_end) }] });
  });
  it("clears empty horizons without inserting and does not trigger on rollback", async () => {
    expect(await (await put({ ...body, blocks: [] })).json()).toEqual({ stored: 0 });
    expect(mocks.createMany).not.toHaveBeenCalled();
    mocks.trigger.mockClear();
    mocks.transaction.mockRejectedValueOnce(Error("rollback"));
    expect((await put(body)).status).toBe(500);
    expect(mocks.trigger).not.toHaveBeenCalled();
  });
});

describe("Google Calendar routes", () => {
  let googleBase: string;
  const originalFetch = global.fetch;

  beforeAll(() => {
    googleBase = base.replace("/busy-blocks", "/calendar/google");
    global.fetch = async (url: string | URL | globalThis.Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("googleapis.com")) {
        return mocks.fetch(url, init);
      }
      return originalFetch(url, init);
    };
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    mocks.findUnique.mockResolvedValue(null);
  });

  it("GET /calendar/google returns status", async () => {
    mocks.findUnique.mockResolvedValue({ status: "active", lastSyncedAt: new Date("2026-09-26T00:00:00Z") });
    const res = await fetch(googleBase, { headers: { authorization: `Bearer ${signToken(userId)}` } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ connected: true, last_synced_at: "2026-09-26T00:00:00.000Z", revoked: false });
  });

  it("POST /calendar/google/start returns auth url", async () => {
    const res = await fetch(`${googleBase}/start`, { 
      method: "POST", 
      headers: { authorization: `Bearer ${signToken(userId)}`, "content-type": "application/json" },
      body: JSON.stringify({ redirect_uri: "myapp://cb" })
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.url).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(data.url).toContain("prompt=consent");
    expect(data.url).toContain("state=");
  });

  it("DELETE /calendar/google disconnects", async () => {
    mocks.findUnique.mockResolvedValue({ refreshTokenEnc: "enc" });
    mocks.fetch.mockResolvedValue({ ok: true });

    const res = await fetch(googleBase, { 
      method: "DELETE", 
      headers: { authorization: `Bearer ${signToken(userId)}` }
    });
    expect(res.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalled();
  });

  it("GET /calendar/google/callback handles success", async () => {
    mocks.verifyState.mockReturnValue({ userId, redirectUri: "myapp://cb" });
    mocks.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ refresh_token: "ref", scope: "scope1 scope2" }) });
    mocks.encryptToken.mockReturnValue("encrypted-ref");

    const res = await fetch(`${googleBase}/callback?code=abc&state=xyz`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("myapp://cb?ok=1");
    expect(mocks.upsert).toHaveBeenCalled();
  });

  it("GET /calendar/google/callback handles invalid state", async () => {
    mocks.verifyState.mockImplementation(() => { throw new Error("bad"); });
    const res = await fetch(`${googleBase}/callback?code=abc&state=xyz`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("error=invalid_state");
  });
});

describe("GET /availability/me", () => {
  const url = () => base.replace("/busy-blocks", "/availability/me");
  const busy = { startsAt: new Date("2026-09-29T14:00:00Z"), endsAt: new Date("2026-09-29T15:00:00Z") };
  const event = { startsAt: new Date("2026-09-30T22:00:00Z"), endsAt: new Date("2026-10-01T00:00:00Z") };
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
    mocks.userFindUnique.mockResolvedValue({ id: userId, passwordChangedAt: null, timezone: "America/New_York", busyBlocks: [busy] });
    mocks.eventFindMany.mockResolvedValue([event]);
  });
  afterAll(() => vi.useRealTimers());

  it("requires authentication", async () => {
    expect((await fetch(url())).status).toBe(401);
    expect(mocks.eventFindMany).not.toHaveBeenCalled();
  });

  it("returns only the caller's free windows, computed like the matcher", async () => {
    const res = await fetch(url(), { headers: { authorization: `Bearer ${signToken(userId)}` } });
    expect(res.status).toBe(200);
    expect(mocks.userFindUnique).toHaveBeenLastCalledWith({ where: { id: userId }, include: { busyBlocks: true } });
    expect(mocks.eventFindMany).toHaveBeenCalledWith({ where: { status: { in: ["voting", "confirmed"] }, participants: { some: { userId } } } });
    const expected = freeWindows([{ id: userId, timezone: "America/New_York", busyBlocks: [{ start: busy.startsAt, end: busy.endsAt }], openEvents: [{ start: event.startsAt, end: event.endsAt }] }], new Date(), { busyPaddingMin: 15, minLeadHours: 2, horizonDays: 7 });
    const { windows, busy_blocks } = await res.json() as { windows: { starts_at: string; ends_at: string }[]; busy_blocks: { starts_at: string; ends_at: string }[] };
    expect(windows.length).toBeGreaterThan(0);
    expect(windows).toEqual(expected.map(w => ({ starts_at: w.start.toISOString(), ends_at: w.end.toISOString() })));
    expect(busy_blocks).toEqual([{ starts_at: busy.startsAt.toISOString(), ends_at: busy.endsAt.toISOString() }]);
    for (const block of [busy, event]) {
      expect(windows.some(w => new Date(w.starts_at) < block.endsAt && new Date(w.ends_at) > block.startsAt)).toBe(false);
    }
  });
});

describe("Manual Busy Blocks (/availability/manual-busy-blocks)", () => {
  const manualUrl = () => base.replace("/busy-blocks", "/availability/manual-busy-blocks");
  const blockItem = {
    id: "mb-1",
    userId,
    startsAt: new Date("2026-10-01T10:00:00.000Z"),
    endsAt: new Date("2026-10-01T12:00:00.000Z"),
    source: "manual",
  };

  it("requires authentication for all manual busy block endpoints", async () => {
    expect((await fetch(manualUrl())).status).toBe(401);
    expect((await fetch(manualUrl(), { method: "POST" })).status).toBe(401);
    expect((await fetch(`${manualUrl()}/mb-1`, { method: "DELETE" })).status).toBe(401);
  });

  it("lists the caller's manual busy blocks", async () => {
    mocks.findMany.mockResolvedValue([blockItem]);
    const res = await fetch(manualUrl(), {
      headers: { authorization: `Bearer ${signToken(userId)}` },
    });
    expect(res.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { userId, source: "manual" },
      orderBy: { startsAt: "asc" },
    });
    const data = await res.json();
    expect(data.blocks).toEqual([
      {
        id: "mb-1",
        starts_at: blockItem.startsAt.toISOString(),
        ends_at: blockItem.endsAt.toISOString(),
        source: "manual",
      },
    ]);
  });

  it("creates a manual busy block with valid times", async () => {
    mocks.busyBlockCreate.mockResolvedValue(blockItem);
    const res = await fetch(manualUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${signToken(userId)}`,
      },
      body: JSON.stringify({
        starts_at: blockItem.startsAt.toISOString(),
        ends_at: blockItem.endsAt.toISOString(),
      }),
    });
    expect(res.status).toBe(201);
    expect(mocks.busyBlockCreate).toHaveBeenCalledWith({
      data: {
        userId,
        startsAt: blockItem.startsAt,
        endsAt: blockItem.endsAt,
        source: "manual",
      },
    });
    const data = await res.json();
    expect(data.id).toBe("mb-1");
  });

  it("rejects invalid time ranges where starts_at >= ends_at", async () => {
    const res = await fetch(manualUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${signToken(userId)}`,
      },
      body: JSON.stringify({
        starts_at: "2026-10-01T14:00:00.000Z",
        ends_at: "2026-10-01T12:00:00.000Z",
      }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("starts_at_must_be_before_ends_at");
  });

  it("deletes a manual busy block", async () => {
    mocks.busyBlockFindFirst.mockResolvedValue(blockItem);
    mocks.busyBlockDelete.mockResolvedValue(blockItem);
    const res = await fetch(`${manualUrl()}/mb-1`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${signToken(userId)}` },
    });
    expect(res.status).toBe(204);
    expect(mocks.busyBlockFindFirst).toHaveBeenCalledWith({
      where: { id: "mb-1", userId, source: "manual" },
    });
    expect(mocks.busyBlockDelete).toHaveBeenCalledWith({
      where: { id: "mb-1" },
    });
  });

  it("returns 404 when deleting a non-existent or other user's block", async () => {
    mocks.busyBlockFindFirst.mockResolvedValue(null);
    const res = await fetch(`${manualUrl()}/unknown`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${signToken(userId)}` },
    });
    expect(res.status).toBe(404);
  });
});

