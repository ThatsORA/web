import { PutBusyBlocksResponse, routes } from "@web/contract";
import { api, getToken } from "../../lib/api";
import { createCalendarSync } from "./sync";

let cached: { token: string; sync: ReturnType<typeof createCalendarSync> } | null = null;

// SDK 57 includes the legacy calendar API in Expo Go.
export function createDeviceCalendarSync() {
  const token = getToken();
  if (token && cached?.token === token) return cached.sync;
  const sync = createCalendarSync({
    permission: async request => {
      if (!token || getToken() !== token) return false;
      const Calendar = await import("expo-calendar/legacy");
      const permission = await (request ? Calendar.requestCalendarPermissionsAsync() : Calendar.getCalendarPermissionsAsync());
      return permission.granted;
    },
    read: async (start, end) => {
      const Calendar = await import("expo-calendar/legacy");
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      return calendars.length ? Calendar.getEventsAsync(calendars.map(calendar => calendar.id), start, end) : [];
    },
    upload: body => {
      if (!token || getToken() !== token) throw new Error("Session changed during calendar sync");
      return api(routes.busyBlocks, PutBusyBlocksResponse, { method: "PUT", body });
    },
  });
  cached = token ? { token, sync } : null;
  return sync;
}
