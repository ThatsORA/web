import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BusyBlock } from "@prisma/client";
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(), transaction: vi.fn(), trigger: vi.fn() }));
vi.mock("../../lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("../matching/matcher", () => ({ triggerMatcher: mocks.trigger }));
import { calendarRouter } from "./router";
import { signToken } from "../../lib/auth";
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
  mocks.findMany.mockResolvedValue([]);
  mocks.deleteMany.mockResolvedValue({ count: 0 });
  mocks.createMany.mockResolvedValue({ count: 1 });
  mocks.trigger.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(async callback => callback({ busyBlock: { findMany: mocks.findMany, deleteMany: mocks.deleteMany, createMany: mocks.createMany } }));
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
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { userId, startsAt: { lt: new Date(body.horizon_end) }, endsAt: { gt: new Date(body.horizon_start) } } });
    expect(mocks.createMany).toHaveBeenCalledWith({ data: [{ userId, source: "device_calendar", startsAt: new Date(body.blocks[0]!.starts_at), endsAt: new Date(body.blocks[0]!.ends_at) }] });
    expect(mocks.trigger).toHaveBeenCalledTimes(1);
    expect(mocks.createMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.trigger.mock.invocationCallOrder[0]!);
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
