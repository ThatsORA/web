import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncGoogleCalendar } from "./googleSync";
import { prisma } from "../../lib/prisma";
import { encryptToken } from "./crypto";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    googleCalendarConnection: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    busyBlock: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../env", () => ({
  env: {
    GOOGLE_OAUTH_CLIENT_ID: "client_id",
    GOOGLE_OAUTH_CLIENT_SECRET: "client_secret",
    GOOGLE_TOKEN_ENC_KEY: "00000000000000000000000000000000",
    MATCH_HORIZON_DAYS: 7,
    DEMO_MODE: false,
  },
}));

// Mock fetch
global.fetch = vi.fn();

describe("syncGoogleCalendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles revoked token (invalid_grant)", async () => {
    vi.mocked(prisma.googleCalendarConnection.findUnique).mockResolvedValue({
      id: "conn1",
      userId: "u1",
      refreshTokenEnc: encryptToken("refresh_token"),
      scopes: [],
      status: "active",
      connectedAt: new Date(),
      lastSyncedAt: null,
      lastError: null,
    } as any);

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid_grant" }),
    } as any);

    const res = await syncGoogleCalendar("u1");

    expect(res).toEqual({ success: false, revoked: true });
    expect(prisma.googleCalendarConnection.update).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { status: "revoked", lastError: "invalid_grant" },
    });
  });

  it("merges intervals across calendars and replaces horizon inside transaction", async () => {
    vi.mocked(prisma.googleCalendarConnection.findUnique).mockResolvedValue({
      id: "conn1",
      userId: "u1",
      refreshTokenEnc: encryptToken("refresh_token"),
      scopes: [],
      status: "active",
      connectedAt: new Date(),
      lastSyncedAt: null,
      lastError: null,
    } as any);

    // fetch 1: token
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "acc_tok" }),
    } as any);

    // fetch 2: calendarList
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          { id: "cal1", accessRole: "owner" },
          { id: "cal2", accessRole: "writer" },
        ],
      }),
    } as any);

    // fetch 3: freeBusy
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calendars: {
          cal1: {
            busy: [
              { start: "2026-09-29T10:00:00Z", end: "2026-09-29T11:00:00Z" },
              { start: "2026-09-29T10:30:00Z", end: "2026-09-29T11:30:00Z" }, // overlapping
            ],
          },
          cal2: {
            busy: [
              { start: "2026-09-29T12:00:00Z", end: "2026-09-29T13:00:00Z" },
            ],
          },
        },
      }),
    } as any);

    vi.mocked(prisma.$transaction).mockResolvedValueOnce([{}, {}, {}] as any);

    const res = await syncGoogleCalendar("u1");

    expect(res).toEqual({ success: true, stored: 2 });
    expect(prisma.$transaction).toHaveBeenCalled();
    // First op should be deleteMany google_calendar blocks
    expect(prisma.busyBlock.deleteMany).toHaveBeenCalled();
    const deleteCalls = vi.mocked(prisma.busyBlock.deleteMany).mock.calls;
    expect((deleteCalls[0]?.[0] as any)?.where?.source).toBe("google_calendar");
    
    // Second op should be createMany with merged blocks
    expect(prisma.busyBlock.createMany).toHaveBeenCalled();
    const createCalls = vi.mocked(prisma.busyBlock.createMany).mock.calls;
    const created = (createCalls[0]?.[0] as any)?.data as Array<{ startsAt: Date; endsAt: Date }>;
    expect(created).toHaveLength(2);
    expect(created[0]?.startsAt).toEqual(new Date("2026-09-29T10:00:00Z"));
    expect(created[0]?.endsAt).toEqual(new Date("2026-09-29T11:30:00Z"));
  });
});
