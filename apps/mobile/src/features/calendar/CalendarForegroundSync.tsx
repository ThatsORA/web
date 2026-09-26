import { useEffect } from "react";
import { AppState } from "react-native";
import { api } from "../../lib/api";
import { z } from "zod";
import { createDeviceCalendarSync } from "./device";

/** Mount once in the signed-in shell, keyed by user ID so account changes reset sync state. */
export function CalendarForegroundSync() {
  useEffect(() => {
    const sync = createDeviceCalendarSync();
    const refresh = () => {
      void sync.sync().catch(() => {});
      void api("/calendar/google/sync", z.any(), { method: "POST" }).catch(() => {});
    };
    if (AppState.currentState === "active") refresh();
    const subscription = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    return () => subscription.remove();
  }, []);
  return null;
}
