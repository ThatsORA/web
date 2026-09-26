import { PutBusyBlocksResponse, routes } from "@web/contract";
import { api, getToken } from "../../lib/api";
import { createCalendarSync } from "./sync";

let cached: { token: string; sync: ReturnType<typeof createCalendarSync> } | null = null;

// Lazy loading lets the rest of the app load on platforms without the native module.
export function createDeviceCalendarSync() {
  const token = getToken();
  if (token && cached?.token === token) return cached.sync;
  const sync = createCalendarSync({
    permission: async request => {
      if (!token || getToken() !== token) return false;
      const Calendar = await import("expo-calendar");
      const permission = await (request ? Calendar.requestCalendarPermissions(false) : Calendar.getCalendarPermissions(false));
      return permission.granted;
    },
    read: async (start, end) => {
      const Calendar = await import("expo-calendar");
      const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
      return calendars.length ? Calendar.listEvents(calendars, start, end) : [];
    },
    upload: body => {
      if (!token || getToken() !== token) throw new Error("Session changed during calendar sync");
      return api(routes.busyBlocks, PutBusyBlocksResponse, { method: "PUT", body });
    },
  });
  cached = token ? { token, sync } : null;
  return sync;
}
