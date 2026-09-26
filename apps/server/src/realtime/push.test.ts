import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), deleteMany: vi.fn() }));
vi.mock("../lib/prisma", () => ({ prisma: { pushToken: mocks } }));

import { buildPushMessage, pushEventCreated, sendPushToUsers } from "./push";
import { env } from "../env";

const eventId = "2b5232d3-9424-4e7c-8e2f-0299693b54eb";

const originalDemoMode = env.DEMO_MODE;
beforeEach(() => {
  vi.resetAllMocks();
  env.DEMO_MODE = false;
});
afterEach(() => {
  env.DEMO_MODE = originalDemoMode;
});

describe("buildPushMessage", () => {
  it("builds the requested local-time created copy with thin data", () => {
    expect(buildPushMessage({
      kind: "created",
      eventId,
      startsAt: new Date("2026-10-01T22:30:00Z"),
      timezone: "America/New_York",
      vibeTag: "dinner",
    })).toEqual({
      title: "New hangout idea",
      body: "New hangout idea: Thu 6:30pm dinner",
      data: { event_id: eventId },
    });
  });

  it.each([
    { kind: "confirmed", eventId } as const,
    { kind: "venue_changed", eventId } as const,
  ])("never includes votes, counts, or ghost-pass identity in $kind copy", (event) => {
    const serialized = JSON.stringify(buildPushMessage(event)).toLowerCase();
    expect(serialized).not.toMatch(/vote|responded|total|ghost|pass|attendee|count/);
    expect(JSON.parse(serialized).data).toEqual({ event_id: eventId });
  });

  it("turns invalid timezone formatting into a rejected push promise", async () => {
    await expect(pushEventCreated([], {
      id: eventId,
      startsAt: new Date("2026-10-01T22:30:00Z"),
      timezone: "not-a-timezone",
      vibeTag: "dinner",
    })).rejects.toThrow();
  });
});

describe("sendPushToUsers", () => {
  it("caps batches at 100 and deletes only tokens paired with DeviceNotRegistered tickets", async () => {
    const tokens = Array.from({ length: 101 }, (_, index) => `ExpoPushToken[token-${index}]`);
    mocks.findMany.mockResolvedValue(tokens.map((token) => ({ token })));
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const messages = JSON.parse(String(init?.body)) as { to: string }[];
      return new Response(JSON.stringify({
        data: messages.map(({ to }) => to === "ExpoPushToken[token-100]"
          ? { status: "error", details: { error: "DeviceNotRegistered" } }
          : { status: "ok", id: `ticket-${to}` }),
      }), { status: 200, headers: { "content-type": "application/json" } });
    });

    await sendPushToUsers(["user-1", "user-1", "user-2"], buildPushMessage({ kind: "confirmed", eventId }), fetcher as typeof fetch);

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ["user-1", "user-2"] } },
      select: { token: true },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toHaveLength(100);
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body))).toHaveLength(1);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { token: { in: ["ExpoPushToken[token-100]"] } } });
  });

  it("surfaces provider errors to the detached caller without deleting tokens", async () => {
    mocks.findMany.mockResolvedValue([{ token: "ExpoPushToken[token-1]" }]);
    const fetcher = vi.fn(async () => new Response("unavailable", { status: 503 }));
    await expect(sendPushToUsers(["user-1"], buildPushMessage({ kind: "confirmed", eventId }), fetcher as typeof fetch))
      .rejects.toThrow("Expo Push failed with HTTP 503");
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("surfaces non-registration ticket errors without exposing tokens", async () => {
    mocks.findMany.mockResolvedValue([{ token: "ExpoPushToken[secret-token]" }]);
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      data: [{ status: "error", message: "credentials", details: { error: "InvalidCredentials" } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const promise = sendPushToUsers(["user-1"], buildPushMessage({ kind: "confirmed", eventId }), fetcher as typeof fetch);
    await expect(promise).rejects.toThrow("Expo Push rejected 1 notification(s): InvalidCredentials");
    await expect(promise).rejects.not.toThrow("secret-token");
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("drops malformed stored tokens without poisoning valid recipients", async () => {
    mocks.findMany.mockResolvedValue([
      { token: "garbage" },
      { token: "ExpoPushToken[valid-token]" },
    ]);
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      data: [{ status: "ok", id: "ticket-1" }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    await sendPushToUsers(["user-1"], buildPushMessage({ kind: "confirmed", eventId }), fetcher as typeof fetch);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { token: { in: ["garbage"] } } });
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual([
      expect.objectContaining({ to: "ExpoPushToken[valid-token]" }),
    ]);
  });

  it("does not call Expo when no registered tokens exist", async () => {
    mocks.findMany.mockResolvedValue([]);
    const fetcher = vi.fn();
    await sendPushToUsers(["user-1"], buildPushMessage({ kind: "confirmed", eventId }), fetcher as typeof fetch);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("suppresses live push delivery in DEMO_MODE", async () => {
    env.DEMO_MODE = true;
    const fetcher = vi.fn();
    await sendPushToUsers(["user-1"], buildPushMessage({ kind: "confirmed", eventId }), fetcher as typeof fetch);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
