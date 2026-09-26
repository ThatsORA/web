import { routes } from "@web/contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setToken } from "./api";
import { eventIdFromPushData, feedHrefForPush, pushSkipReason, savePushToken, unregisterPushToken } from "./push";

const eventId = "2b5232d3-9424-4e7c-8e2f-0299693b54eb";
const pushToken = "ExponentPushToken[device-token]";

describe("pushSkipReason", () => {
  const ok = { os: "ios", inExpoGo: false, projectId: "eas-project" };

  it("registers on a dev or store build with a projectId", () => {
    expect(pushSkipReason(ok)).toBeNull();
    expect(pushSkipReason({ ...ok, os: "android" })).toBeNull();
  });

  it("skips web, Expo Go, and builds without an EAS projectId", () => {
    expect(pushSkipReason({ ...ok, os: "web" })).toBe("unsupported-platform");
    expect(pushSkipReason({ ...ok, inExpoGo: true })).toBe("expo-go");
    expect(pushSkipReason({ ...ok, os: "android", inExpoGo: true })).toBe("expo-go");
    expect(pushSkipReason({ ...ok, projectId: undefined })).toBe("no-project-id");
    expect(pushSkipReason({ ...ok, projectId: "" })).toBe("no-project-id");
  });
});

describe("notification tap → route", () => {
  it("reads event_id from the server's thin payload", () => {
    expect(eventIdFromPushData({ event_id: eventId })).toBe(eventId);
  });

  it("ignores missing or malformed payloads", () => {
    expect(eventIdFromPushData(undefined)).toBeNull();
    expect(eventIdFromPushData({})).toBeNull();
    expect(eventIdFromPushData({ event_id: "not-a-uuid" })).toBeNull();
    expect(eventIdFromPushData({ event_id: 42 })).toBeNull();
  });

  it("opens the feed at the event, or just the feed", () => {
    expect(feedHrefForPush({ event_id: eventId })).toEqual({ pathname: "/(main)", params: { event: eventId } });
    expect(feedHrefForPush({})).toBe("/(main)");
  });
});

describe("push token API", () => {
  const fetchMock = vi.fn();

  beforeEach(async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await unregisterPushToken(); // forget any token a previous test registered
    fetchMock.mockClear();
    setToken("jwt-a");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setToken(null);
  });

  function call(n: number) {
    const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
    return { url, method: init.method, body: JSON.parse(String(init.body)), headers: init.headers };
  }

  it("PUTs the Expo token with its platform", async () => {
    await savePushToken(pushToken, "android");
    expect(call(0)).toMatchObject({
      method: "PUT",
      body: { token: pushToken, platform: "android" },
      headers: { authorization: "Bearer jwt-a" },
    });
    expect(call(0).url.endsWith(routes.pushToken)).toBe(true);
  });

  it("DELETEs the registered token with the old session even when log out clears it right after", async () => {
    await savePushToken(pushToken, "ios");
    const pending = unregisterPushToken();
    setToken(null); // what session.clear() does
    await pending;
    expect(call(1)).toMatchObject({
      method: "DELETE",
      body: { token: pushToken },
      headers: { authorization: "Bearer jwt-a" },
    });
  });

  it("does nothing on log out when this device never registered", async () => {
    await unregisterPushToken();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never blocks log out when the DELETE fails", async () => {
    await savePushToken(pushToken, "ios");
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(unregisterPushToken()).resolves.toBeUndefined();
  });
});
