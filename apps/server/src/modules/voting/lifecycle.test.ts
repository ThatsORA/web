import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  emitToUsers: vi.fn(),
}));
vi.mock("../../lib/prisma", () => ({
  prisma: { event: { findMany: mocks.findMany, findUnique: mocks.findUnique, updateMany: mocks.updateMany } },
}));
vi.mock("../../realtime", () => ({ emitToUsers: mocks.emitToUsers }));
import { sweepVoting } from "./lifecycle";

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("sweepVoting", () => {
  it("starts all due closes together, isolates failures, then completes ended events", async () => {
    const now = new Date("2026-09-26T12:00:00Z");
    const error = new Error("one close failed");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    let release!: (value: null) => void;
    const pending = new Promise<null>((resolve) => { release = resolve; });
    mocks.findMany
      .mockResolvedValueOnce([{ id: "slow" }, { id: "failed" }, { id: "ready" }])
      .mockResolvedValueOnce([{ id: "ended", participants: [{ userId: "user" }] }]);
    mocks.findUnique.mockReturnValueOnce(pending).mockRejectedValueOnce(error).mockResolvedValueOnce(null);
    mocks.updateMany.mockResolvedValue({ count: 1 });

    const sweep = sweepVoting(now);
    await Promise.resolve();
    expect(mocks.findUnique.mock.calls.map(([query]) => query.where.id)).toEqual(["slow", "failed", "ready"]);
    expect(mocks.findMany).toHaveBeenCalledTimes(1);

    release(null);
    await expect(sweep).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("closeVoting", "failed", error);
    expect(mocks.findMany).toHaveBeenLastCalledWith({
      where: { status: "confirmed", endsAt: { lte: now } },
      include: { participants: { select: { userId: true } } },
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "ended", status: "confirmed" }, data: { status: "completed" },
    });
    expect(mocks.emitToUsers).toHaveBeenCalledWith(["user"], "event:resolved", { event_id: "ended", status: "completed" });
  });
});
