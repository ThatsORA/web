import type { ComponentType } from "react";

export { CalendarStep } from "./CalendarStep";
export { CalendarForegroundSync } from "./CalendarForegroundSync";
export { busyBlockPayload, createCalendarSync } from "./sync";

/** Mount point for Riley's availability settings. Undefined if not yet provided. */
export const AvailabilitySettings: ComponentType | undefined = undefined;

