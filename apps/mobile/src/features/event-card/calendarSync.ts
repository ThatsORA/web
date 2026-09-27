// Owner: Andy — Writes confirmed hangouts to the device calendar with idempotency via expo-secure-store.
// Pure mapping and dependency-injected calendar sync logic for unit testing and runtime usage.
import type { EventCardPayload } from "@web/contract";
import { vibeLabel } from "./format";

export type CalendarDetails = {
  title: string;
  startDate: Date;
  endDate: Date;
  location: string;
  notes: string;
};

export type CalendarStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync?(key: string): Promise<void>;
};

export type CalendarModule = {
  requestPermission(): Promise<boolean>;
  getDefaultCalendarId(): Promise<string | null>;
  createEvent(calendarId: string, details: CalendarDetails): Promise<string>;
  updateEvent(eventId: string, details: CalendarDetails): Promise<void>;
};

export type AddToCalendarResult =
  | { success: true; status: "created" | "already_added" | "updated"; message: string; calendarEventId: string }
  | { success: false; status: "permission_denied" | "no_calendar" | "error"; message: string };

export function calendarEventStorageKey(eventId: string): string {
  return `web.calendar_event.${eventId}`;
}

/** Pure mapping function mapEventToCalendarDetails(card) -> { title: "<vibe> at <venue>", startDate, endDate, location, notes } */
export function mapEventToCalendarDetails(card: EventCardPayload): CalendarDetails {
  const vibe = vibeLabel(card.vibe_tag);
  const venueName = card.outcome?.venue?.name ?? "";
  const title = venueName ? `${vibe} at ${venueName}` : vibe;
  const location = venueName;
  const participants = card.participants.map((p) => p.display_name ?? p.username).join(", ");
  const facts = card.outcome?.venue?.facts_line ? ` · ${card.outcome.venue.facts_line}` : "";
  const notes = `With ${participants}${facts}`;

  return {
    title,
    startDate: new Date(card.starts_at),
    endDate: new Date(card.ends_at),
    location,
    notes,
  };
}

/** Idempotent calendar write/update logic using injected dependencies for testing. */
export async function addToCalendar(
  card: EventCardPayload,
  deps: { store: CalendarStore; calendar: CalendarModule }
): Promise<AddToCalendarResult> {
  const details = mapEventToCalendarDetails(card);
  const key = calendarEventStorageKey(card.id);
  const existingCalendarEventId = await deps.store.getItemAsync(key);

  if (existingCalendarEventId) {
    const hasPermission = await deps.calendar.requestPermission();
    if (!hasPermission) {
      return {
        success: false,
        status: "permission_denied",
        message: "Calendar permission denied",
      };
    }

    try {
      await deps.calendar.updateEvent(existingCalendarEventId, details);
      return {
        success: true,
        status: "already_added",
        message: "Already added",
        calendarEventId: existingCalendarEventId,
      };
    } catch {
      // Event was deleted from native calendar, fall through to re-create
    }
  }

  const hasPermission = await deps.calendar.requestPermission();
  if (!hasPermission) {
    return {
      success: false,
      status: "permission_denied",
      message: "Calendar permission denied",
    };
  }

  const calendarId = await deps.calendar.getDefaultCalendarId();
  if (!calendarId) {
    return {
      success: false,
      status: "no_calendar",
      message: "No default calendar found",
    };
  }

  try {
    const calendarEventId = await deps.calendar.createEvent(calendarId, details);
    await deps.store.setItemAsync(key, calendarEventId);
    return {
      success: true,
      status: "created",
      message: "Added to calendar",
      calendarEventId,
    };
  } catch (err: any) {
    return {
      success: false,
      status: "error",
      message: err?.message || "Failed to add to calendar",
    };
  }
}

/** On venue swap ("Change spot"), if previously added to device calendar, update the location. */
export async function syncCalendarOnSwap(
  card: EventCardPayload,
  deps: { store: CalendarStore; calendar: CalendarModule }
): Promise<AddToCalendarResult | null> {
  const key = calendarEventStorageKey(card.id);
  const existingCalendarEventId = await deps.store.getItemAsync(key);
  if (!existingCalendarEventId) {
    return null;
  }
  return addToCalendar(card, deps);
}

// Runtime native bindings for expo-calendar/legacy and expo-secure-store
export async function getDeviceCalendarModule(): Promise<CalendarModule> {
  let Calendar: any;
  try {
    Calendar = await import("expo-calendar/legacy");
  } catch {
    Calendar = await import("expo-calendar");
  }

  return {
    async requestPermission() {
      const perm = await Calendar.requestCalendarPermissionsAsync();
      return perm.status === "granted" || perm.granted === true;
    },
    async getDefaultCalendarId() {
      try {
        if (Calendar.getDefaultCalendarAsync) {
          const cal = await Calendar.getDefaultCalendarAsync();
          if (cal?.id) return cal.id;
        }
      } catch {
        // Fallback for Android or unsupported platforms
      }
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const primary =
        calendars.find((c: any) => c.isPrimary) ||
        calendars.find((c: any) => c.allowsModifications) ||
        calendars[0];
      return primary?.id ?? null;
    },
    async createEvent(calendarId, details) {
      return Calendar.createEventAsync(calendarId, {
        title: details.title,
        startDate: details.startDate,
        endDate: details.endDate,
        location: details.location,
        notes: details.notes,
      });
    },
    async updateEvent(eventId, details) {
      return Calendar.updateEventAsync(eventId, {
        title: details.title,
        startDate: details.startDate,
        endDate: details.endDate,
        location: details.location,
        notes: details.notes,
      });
    },
  };
}

let secureStoreModule: any = null;
function getSecureStore() {
  if (!secureStoreModule) {
    try {
      secureStoreModule = require("expo-secure-store");
    } catch {
      secureStoreModule = null;
    }
  }
  return secureStoreModule;
}

const inMemoryStore = new Map<string, string>();

export function getDeviceCalendarStore(): CalendarStore {
  const store = getSecureStore();
  if (!store) {
    return {
      async getItemAsync(key: string) {
        return inMemoryStore.get(key) ?? null;
      },
      async setItemAsync(key: string, value: string) {
        inMemoryStore.set(key, value);
      },
      async deleteItemAsync(key: string) {
        inMemoryStore.delete(key);
      },
    };
  }
  return {
    getItemAsync: (key) => store.getItemAsync(key),
    setItemAsync: (key, value) => store.setItemAsync(key, value),
    deleteItemAsync: (key) => store.deleteItemAsync(key),
  };
}

export async function addConfirmedEventToCalendar(
  card: EventCardPayload,
  customDeps?: { store?: CalendarStore; calendar?: CalendarModule }
): Promise<AddToCalendarResult> {
  const store = customDeps?.store ?? getDeviceCalendarStore();
  const calendar = customDeps?.calendar ?? (await getDeviceCalendarModule());
  return addToCalendar(card, { store, calendar });
}

export async function syncSwappedEventToCalendar(card: EventCardPayload): Promise<AddToCalendarResult | null> {
  const store = getDeviceCalendarStore();
  const calendar = await getDeviceCalendarModule();
  return syncCalendarOnSwap(card, { store, calendar });
}

