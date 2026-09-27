import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  pushToken: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("../lib/prisma", () => ({
  prisma: mockPrisma,
}));

const mockEnv = vi.hoisted(() => ({ DEMO_MODE: false }));
vi.mock("../env", () => ({ env: mockEnv }));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  EXPO_PUSH_URL,
  buildEventCreatedMessage,
  buildEventResolvedMessage,
  buildVenueChangedMessage,
  formatEventCreatedBody,
  pushEventCreated,
  pushEventResolved,
  pushVenueChanged,
} from "./push";

describe("realtime/push", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.DEMO_MODE = false;
  });

  describe("message formatters (no vote leakage)", () => {
    it("invites a Mixer without naming or counting invitees", () => {
      expect(buildEventCreatedMessage("evt-123", { isMixer: true })).toEqual({
        title: "Mixer invitation",
        body: "Choose a spot and commit to attend. Responses stay private.",
        data: { event_id: "evt-123" },
      });
    });
    it("formats event created body with time, vibe, and timezone", () => {
      // 2026-10-01 is Thursday. 22:30 UTC = 18:30 EDT (6:30pm)
      const date = new Date("2026-10-01T22:30:00Z");
      const body = formatEventCreatedBody({
        startsAt: date,
        vibeTag: "dinner",
        timezone: "America/New_York",
      });
      expect(body).toBe("New hangout idea: Thu 6:30pm dinner");
    });

    it("formats event created body with round hours", () => {
      const date = new Date("2026-10-01T23:00:00Z");
      const body = formatEventCreatedBody({
        startsAt: date,
        vibeTag: "night_out",
        timezone: "America/New_York",
      });
      expect(body).toBe("New hangout idea: Thu 7pm night out");
    });

    it("falls back gracefully when startsAt is missing", () => {
      const body = formatEventCreatedBody();
      expect(body).toBe("New hangout idea: vote on your options!");
    });

    it("builds thin event created message with event_id", () => {
      const msg = buildEventCreatedMessage("evt-123", {
        startsAt: new Date("2026-10-01T22:30:00Z"),
        vibeTag: "dinner",
        timezone: "America/New_York",
      });
      expect(msg).toEqual({
        title: "New hangout idea",
        body: "New hangout idea: Thu 6:30pm dinner",
        data: { event_id: "evt-123" },
      });
      // Verify no vote fields or participants
      expect(msg).not.toHaveProperty("votes");
      expect(msg).not.toHaveProperty("ghost_passed");
      expect(JSON.stringify(msg)).not.toContain("vote");
    });

    it("builds confirmed event resolved message without vote leakage", () => {
      const msg = buildEventResolvedMessage("evt-123", "confirmed");
      expect(msg).toEqual({
        title: "Hangout Confirmed",
        body: "Your hangout has been confirmed!",
        data: { event_id: "evt-123" },
      });
      expect(JSON.stringify(msg)).not.toContain("ghost");
      expect(JSON.stringify(msg)).not.toContain("tallies");
    });

    it("builds non-confirmed event resolved message", () => {
      const msg = buildEventResolvedMessage("evt-123", "chatted");
      expect(msg).toEqual({
        title: "Hangout Update",
        body: "Hangout status: chatted",
        data: { event_id: "evt-123" },
      });
    });

    it("builds venue changed message", () => {
      const msg = buildVenueChangedMessage("evt-123");
      expect(msg).toEqual({
        title: "Venue Changed",
        body: "The venue for your hangout has been updated.",
        data: { event_id: "evt-123" },
      });
    });
  });

  describe("sending push notifications via Expo Push API", () => {
    it("does nothing when userIds is empty", async () => {
      await pushEventCreated([], "evt-123");
      expect(mockPrisma.pushToken.findMany).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("never calls Expo in DEMO_MODE", async () => {
      mockEnv.DEMO_MODE = true;
      await pushEventCreated(["user-1"], "evt-123");
      expect(mockPrisma.pushToken.findMany).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("does nothing when no tokens are found in DB", async () => {
      mockPrisma.pushToken.findMany.mockResolvedValueOnce([]);
      await pushEventCreated(["user-1"], "evt-123");
      expect(mockPrisma.pushToken.findMany).toHaveBeenCalledWith({
        where: { userId: { in: ["user-1"] } },
        select: { token: true },
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("sends push messages to Expo with thin payload", async () => {
      mockPrisma.pushToken.findMany.mockResolvedValueOnce([
        { token: "ExponentPushToken[token-1]" },
        { token: "ExponentPushToken[token-2]" },
      ]);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { status: "ok", id: "ticket-1" },
            { status: "ok", id: "ticket-2" },
          ],
        }),
      });

      await pushEventCreated(["user-1", "user-2"], "evt-123", {
        startsAt: new Date("2026-10-01T22:30:00Z"),
        vibeTag: "dinner",
        timezone: "America/New_York",
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe(EXPO_PUSH_URL);
      expect(options.method).toBe("POST");
      expect(options.signal).toBeInstanceOf(AbortSignal);
      expect(options.headers).toMatchObject({
        "Content-Type": "application/json",
        Accept: "application/json",
      });

      const body = JSON.parse(options.body as string);
      expect(body).toHaveLength(2);
      expect(body[0]).toEqual({
        to: "ExponentPushToken[token-1]",
        sound: "default",
        title: "New hangout idea",
        body: "New hangout idea: Thu 6:30pm dinner",
        data: { event_id: "evt-123" },
      });
      expect(body[1]).toEqual({
        to: "ExponentPushToken[token-2]",
        sound: "default",
        title: "New hangout idea",
        body: "New hangout idea: Thu 6:30pm dinner",
        data: { event_id: "evt-123" },
      });

      expect(mockPrisma.pushToken.deleteMany).not.toHaveBeenCalled();
    });

    it("deletes expired tokens when Expo reports DeviceNotRegistered", async () => {
      mockPrisma.pushToken.findMany.mockResolvedValueOnce([
        { token: "ExponentPushToken[active-token]" },
        { token: "ExponentPushToken[dead-token]" },
      ]);
      mockPrisma.pushToken.deleteMany.mockResolvedValueOnce({ count: 1 });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { status: "ok", id: "ticket-1" },
            {
              status: "error",
              message: '"ExponentPushToken[dead-token]" is not registered',
              details: { error: "DeviceNotRegistered" },
            },
          ],
        }),
      });

      await pushVenueChanged(["user-1", "user-2"], "evt-456");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockPrisma.pushToken.deleteMany).toHaveBeenCalledWith({
        where: { token: { in: ["ExponentPushToken[dead-token]"] } },
      });
    });

    it("does not delete tokens on other error types", async () => {
      mockPrisma.pushToken.findMany.mockResolvedValueOnce([
        { token: "ExponentPushToken[token-rate-limited]" },
      ]);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              status: "error",
              message: "Rate limit exceeded",
              details: { error: "MessageRateExceeded" },
            },
          ],
        }),
      });

      await pushEventResolved(["user-1"], "evt-789", "confirmed");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockPrisma.pushToken.deleteMany).not.toHaveBeenCalled();
    });

    it("handles fetch network failure gracefully without throwing", async () => {
      mockPrisma.pushToken.findMany.mockResolvedValueOnce([
        { token: "ExponentPushToken[token-1]" },
      ]);
      mockFetch.mockRejectedValueOnce(new Error("Network connection lost"));

      // Should not throw
      await expect(pushEventCreated(["user-1"], "evt-123")).resolves.toBeUndefined();
    });

    it("handles prisma error gracefully without throwing", async () => {
      mockPrisma.pushToken.findMany.mockRejectedValueOnce(new Error("DB timeout"));

      // Should not throw
      await expect(pushEventResolved(["user-1"], "evt-123", "confirmed")).resolves.toBeUndefined();
    });
  });
});
