import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findEvent: vi.fn(), create: vi.fn(), findMany: vi.fn(), findSplit: vi.fn(), updateSplit: vi.fn() }));
vi.mock("../../lib/prisma", () => ({
  prisma: {
    event: { findUnique: mocks.findEvent },
    expense: { create: mocks.create, findMany: mocks.findMany },
    expenseSplit: { findUnique: mocks.findSplit, update: mocks.updateSplit },
  },
}));
import { expensesRouter } from "./router";
import { signToken } from "../../lib/auth";

const [me, bob, cat, ghost] = ["1", "2", "3", "4"].map((d) => `${d}f48fb35-1518-481d-ab60-cfd2dcc28acf`) as [string, string, string, string];
const confirmedEvent = () => ({
  id: "e1",
  status: "confirmed",
  participants: [
    { userId: me, voteStatus: "confirmed" },
    { userId: bob, voteStatus: "confirmed" },
    { userId: cat, voteStatus: "confirmed" },
    { userId: ghost, voteStatus: "ghost_passed" },
  ],
});
const expenseRow = { id: "x1", paidBy: me, totalCents: 1000, description: "Tacos", createdAt: new Date("2026-09-26T20:00:00Z"), splits: [] };
let base: string;
let close: () => void;
beforeAll(async () => {
  const app = express();
  app.use(express.json(), expensesRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => close());
beforeEach(() => {
  vi.clearAllMocks();
  mocks.findEvent.mockResolvedValue(confirmedEvent());
  mocks.create.mockResolvedValue(expenseRow);
  mocks.findMany.mockResolvedValue([expenseRow]);
});
const call = (method: string, path: string, body?: unknown, as = me) =>
  fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${signToken(as)}` }, body: body === undefined ? undefined : JSON.stringify(body) });

describe("expenses router", () => {
  it("splits equally over confirmed attendees only; the payer's share starts settled", async () => {
    const res = await call("POST", "/events/e1/expenses", { total_cents: 1000, description: "Tacos" });
    expect(res.status).toBe(201);
    expect((await res.json()).total_cents).toBe(1000);
    expect(mocks.create.mock.calls[0]![0].data.splits.create).toEqual([
      { userId: me, amountOwedCents: 334, settled: true },
      { userId: bob, amountOwedCents: 333, settled: false },
      { userId: cat, amountOwedCents: 333, settled: false },
    ]);
  });
  it("rejects bad bodies, outsiders, non-attendees and unconfirmed events", async () => {
    expect((await call("POST", "/events/e1/expenses", { total_cents: 10.5, description: "x" })).status).toBe(400);
    expect((await call("POST", "/events/e1/expenses", { total_cents: 100, description: "x" }, "z-stranger")).status).toBe(404);
    expect((await call("POST", "/events/e1/expenses", { total_cents: 100, description: "x" }, ghost)).status).toBe(403);
    mocks.findEvent.mockResolvedValueOnce({ ...confirmedEvent(), status: "voting" });
    expect((await call("POST", "/events/e1/expenses", { total_cents: 100, description: "x" })).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("stores a valid custom split as given and 422s an invalid one (#81)", async () => {
    const splits = [{ user_id: me, amount_cents: 200 }, { user_id: cat, amount_cents: 800 }];
    expect((await call("POST", "/events/e1/expenses", { total_cents: 1000, description: "Tacos", splits })).status).toBe(201);
    expect(mocks.create.mock.calls[0]![0].data.splits.create).toEqual([
      { userId: me, amountOwedCents: 200, settled: true },
      { userId: cat, amountOwedCents: 800, settled: false },
    ]);
    const bad = await call("POST", "/events/e1/expenses", { total_cents: 1000, description: "x", splits: [{ user_id: ghost, amount_cents: 1000 }] });
    expect(bad.status).toBe(422);
    expect(await bad.json()).toEqual({ error: "not_attendee" });
    expect((await call("POST", "/events/e1/expenses", { total_cents: 1000, description: "x", splits: [{ user_id: bob, amount_cents: 999 }] })).status).toBe(422);
    expect(mocks.create).toHaveBeenCalledOnce();
  });
  it("lists expenses for participants", async () => {
    const res = await call("GET", "/events/e1/expenses");
    expect(res.status).toBe(200);
    expect((await res.json()).expenses[0]).toMatchObject({ id: "x1", paid_by: me, created_at: "2026-09-26T20:00:00.000Z" });
    expect((await call("GET", "/events/e1/expenses", undefined, "z-stranger")).status).toBe(404);
  });
  it("lets the payer or the debtor toggle settled, and hides the split from anyone else", async () => {
    mocks.findSplit.mockResolvedValue({ id: "s1", userId: bob, expense: { paidBy: me } });
    expect((await call("PATCH", "/expense-splits/s1", { settled: true })).status).toBe(204);
    expect((await call("PATCH", "/expense-splits/s1", { settled: false }, bob)).status).toBe(204);
    expect((await call("PATCH", "/expense-splits/s1", { settled: true }, cat)).status).toBe(404);
    expect((await call("PATCH", "/expense-splits/s1", { settled: "yes" })).status).toBe(400);
    expect(mocks.updateSplit).toHaveBeenCalledTimes(2);
    expect(mocks.updateSplit).toHaveBeenLastCalledWith({ where: { id: "s1" }, data: { settled: false } });
  });
});
