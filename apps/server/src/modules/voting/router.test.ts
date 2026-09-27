import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), deleteMany: vi.fn(), transaction: vi.fn(), afterResponse: vi.fn() }));
vi.mock("../../lib/prisma", () => ({
  prisma: {
    user: { findUnique: async () => ({ passwordChangedAt: null }) },
    event: { findUnique: mocks.findUnique },
    vote: { upsert: mocks.upsert, deleteMany: mocks.deleteMany },
    eventParticipant: { update: mocks.update },
    $transaction: mocks.transaction,
  },
}));
vi.mock("./lifecycle", () => ({ afterResponse: mocks.afterResponse }));
import { votingRouter } from "./router";
import { signToken } from "../../lib/auth";

const userId = "6f48fb35-1518-481d-ab60-cfd2dcc28acf";
const optionId = "0b8f7f1e-5b0a-4f7e-9a51-6c2f4b8a1d10";
const openEvent = () => ({ id: "e1", status: "voting", voteClosesAt: new Date(Date.now() + 60_000), participants: [{ userId }], options: [{ id: optionId }] });
let base: string;
let close: () => void;
beforeAll(async () => {
  const app = express();
  app.use(express.json(), votingRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/events/e1`;
  close = () => server.close();
});
afterAll(() => close());
beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue(openEvent());
  mocks.transaction.mockResolvedValue([]);
});
const post = (path: string, body?: unknown) =>
  fetch(`${base}/${path}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${signToken(userId)}` }, body: body === undefined ? undefined : JSON.stringify(body) });

describe("voting router", () => {
  it("records a vote and returns no body (no tallies, no identities)", async () => {
    const res = await post("vote", { option_id: optionId });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(mocks.upsert).toHaveBeenCalledOnce();
    expect(mocks.afterResponse).toHaveBeenCalledWith("e1");
  });
  it("rejects bad bodies and options from other events", async () => {
    expect((await post("vote", {})).status).toBe(400);
    expect((await post("vote", { option_id: userId })).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("404s for non-participants and 409s once voting has closed", async () => {
    mocks.findUnique.mockResolvedValueOnce({ ...openEvent(), participants: [] });
    expect((await post("ghost-pass")).status).toBe(404);
    mocks.findUnique.mockResolvedValueOnce({ ...openEvent(), voteClosesAt: new Date(Date.now() - 1) });
    expect((await post("ghost-pass")).status).toBe(409);
    mocks.findUnique.mockResolvedValueOnce({ ...openEvent(), status: "confirmed" });
    expect((await post("vote", { option_id: optionId })).status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("ghost pass drops any earlier vote", async () => {
    expect((await post("ghost-pass")).status).toBe(204);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { eventId: "e1", userId } });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { voteStatus: "ghost_passed" } }));
  });
  it("lets a ghost passer return with a vote while voting is open (#210)", async () => {
    expect((await post("ghost-pass")).status).toBe(204);
    expect((await post("vote", { option_id: optionId })).status).toBe(204);
    expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { voteStatus: "voted" } }));
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });
  it("makes a pass final once voting closed early or at the deadline (#210)", async () => {
    for (const closed of [{ status: "confirmed" }, { status: "expired" }, { voteClosesAt: new Date(Date.now() - 1) }]) {
      mocks.findUnique.mockResolvedValueOnce({ ...openEvent(), ...closed });
      expect((await post("vote", { option_id: optionId })).status).toBe(409);
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
