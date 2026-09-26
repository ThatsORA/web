import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    event: { findMany: mocks.findMany },
    chatMessage: { deleteMany: mocks.deleteMany },
  },
}));

import { cleanupChatMessages } from "./cleanup";

describe("cleanupChatMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes chat messages for events ended more than 7 days ago", async () => {
    const now = new Date("2026-09-26T12:00:00Z");
    const sevenDaysAgo = new Date("2026-09-19T12:00:00Z");

    mocks.findMany.mockResolvedValueOnce([{ id: "e1" }, { id: "e2" }]);
    mocks.deleteMany.mockResolvedValueOnce({ count: 15 });

    const deleted = await cleanupChatMessages(now);

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { endsAt: { lte: sevenDaysAgo } },
      select: { id: true },
    });
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { eventId: { in: ["e1", "e2"] } },
    });
    expect(deleted).toBe(15);
  });

  it("returns 0 and skips deleteMany if no events ended more than 7 days ago", async () => {
    mocks.findMany.mockResolvedValueOnce([]);

    const deleted = await cleanupChatMessages();

    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(deleted).toBe(0);
  });
});
