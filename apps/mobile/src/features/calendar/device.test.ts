import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ token: "user-a", api: vi.fn(), permissions: vi.fn(), calendars: vi.fn(), events: vi.fn() }));
vi.mock("../../lib/api", () => ({ getToken: () => mocks.token, api: mocks.api }));
vi.mock("expo-calendar/legacy", () => ({ requestCalendarPermissionsAsync: mocks.permissions, getCalendarPermissionsAsync: mocks.permissions, getCalendarsAsync: mocks.calendars, getEventsAsync: mocks.events, EntityTypes: { EVENT: "event" } }));
import { createDeviceCalendarSync } from "./device";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.token = `user-${Math.random()}`;
  mocks.permissions.mockResolvedValue({ granted: true });
  mocks.calendars.mockResolvedValue([{ id: "one" }, { id: "two" }]);
  mocks.events.mockResolvedValue([]);
  mocks.api.mockResolvedValue({ stored: 0 });
});
it("reads all event calendars and shares successful sync state with the foreground component", async () => {
  const sync = createDeviceCalendarSync();
  expect(await sync.sync(true)).toBe(0);
  expect(mocks.calendars).toHaveBeenCalledWith("event");
  expect(mocks.events).toHaveBeenCalledWith(["one", "two"], expect.any(Date), expect.any(Date));
  expect(createDeviceCalendarSync()).toBe(sync);
  expect(await createDeviceCalendarSync().sync()).toBeNull();
  expect(mocks.api).toHaveBeenCalledTimes(1);
});
it("does not upload under another account if the session changes while reading", async () => {
  mocks.events.mockImplementationOnce(async () => { mocks.token = "different-user"; return []; });
  await expect(createDeviceCalendarSync().sync(true)).rejects.toThrow("Session changed");
  expect(mocks.api).not.toHaveBeenCalled();
});
it("does not read calendar data when signed out", async () => {
  mocks.token = "";
  expect(await createDeviceCalendarSync().sync()).toBeNull();
  expect(mocks.permissions).not.toHaveBeenCalled();
});
