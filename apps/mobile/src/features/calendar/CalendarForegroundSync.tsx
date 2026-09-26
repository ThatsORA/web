import { useEffect } from "react";
import { AppState } from "react-native";
import { createDeviceCalendarSync } from "./device";

/** Mount once in the signed-in shell, keyed by user ID so account changes reset sync state. */
export function CalendarForegroundSync() {
  useEffect(() => {
    const sync = createDeviceCalendarSync();
    const refresh = () => { void sync.sync().catch(() => { /* Retry on the next foreground transition. */ }); };
    if (AppState.currentState === "active") refresh();
    const subscription = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    return () => subscription.remove();
  }, []);
  return null;
}
