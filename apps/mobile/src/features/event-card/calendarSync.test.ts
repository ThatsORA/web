import { describe, expect, it, vi } from "vitest";
import type { EventCardPayload } from "@web/contract";
import {
  addToCalendar,
  calendarEventStorageKey,
  mapEventToCalendarDetails,
  syncCalendarOnSwap,
  type CalendarModule,
  type CalendarStore,
} from "./calendarSync";
import { FIXTURES } from "./fixtures";

const confirmedCard = FIXTURES.find((f) => f.label === "Confirmed")!.card;

function createMockStore(initialState: Record<string, string> = {}): CalendarStore {
  const data = new Map<string, string>(Object.entries(initialState));
  return {
    async getItemAsync(key: string) {
      return data.get(key) ?? null;
    },
    async setItemAsync(key: string, value: string) {
      data.set(key, value);
    },
    async deleteItemAsync(key: string) {
      data.delete(key);
    },
  };
}

function createMockCalendarModule(overrides?: Partial<CalendarModule>): CalendarModule {
  return {
    requestPermission: async () => true,
    getDefaultCalendarId: async () => "cal_default_123",
    createEvent: async () => "evt_created_789",
    updateEvent: async () => {},
    ...overrides,
  };
}

describe("mapEventToCalendarDetails", () => {
  it("maps confirmed card to title '<vibe> at <venue>', startDate, endDate, location, notes", () => {
    const details = mapEventToCalendarDetails(confirmedCard);
    const venueName = confirmedCard.outcome!.venue!.name;

    expect(details.title).toBe(`Dinner at ${venueName}`);
    expect(details.location).toBe(venueName);
    expect(details.startDate).toEqual(new Date(confirmedCard.starts_at));
    expect(details.endDate).toEqual(new Date(confirmedCard.ends_at));
    expect(details.notes).toContain("With presenter, riley, ojas");
  });

  it("handles different vibe tags cleanly", () => {
    const coffeeCard: EventCardPayload = {
      ...confirmedCard,
      vibe_tag: "quick_coffee",
      outcome: {
        ...confirmedCard.outcome!,
        venue: {
          ...confirmedCard.outcome!.venue!,
          name: "Panther Coffee",
        },
      },
    };

    const details = mapEventToCalendarDetails(coffeeCard);
    expect(details.title).toBe("Coffee at Panther Coffee");
    expect(details.location).toBe("Panther Coffee");
  });
});

describe("addToCalendar idempotency & device calendar integration", () => {
  it("creates a new event on first tap and stores created calendar event ID in SecureStore", async () => {
    const store = createMockStore();
    const createSpy = vi.fn().mockResolvedValue("native_evt_101");
    const calendar = createMockCalendarModule({ createEvent: createSpy });

    const result = await addToCalendar(confirmedCard, { store, calendar });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.status).toBe("created");
      expect(result.calendarEventId).toBe("native_evt_101");
    }
    expect(createSpy).toHaveBeenCalledWith("cal_default_123", expect.objectContaining({
      title: "Dinner at Latin House Grill",
      location: "Latin House Grill",
    }));

    const storedId = await store.getItemAsync(calendarEventStorageKey(confirmedCard.id));
    expect(storedId).toBe("native_evt_101");
  });

  it("handles permission denial gracefully without throwing", async () => {
    const store = createMockStore();
    const calendar = createMockCalendarModule({
      requestPermission: async () => false,
    });

    const result = await addToCalendar(confirmedCard, { store, calendar });

    expect(result.success).toBe(false);
    expect(result.status).toBe("permission_denied");
    expect(result.message).toBe("Calendar permission denied");
  });

  it("handles missing default calendar gracefully", async () => {
    const store = createMockStore();
    const calendar = createMockCalendarModule({
      getDefaultCalendarId: async () => null,
    });

    const result = await addToCalendar(confirmedCard, { store, calendar });

    expect(result.success).toBe(false);
    expect(result.status).toBe("no_calendar");
    expect(result.message).toBe("No default calendar found");
  });

  it("updates existing calendar event on second tap (idempotent)", async () => {
    const key = calendarEventStorageKey(confirmedCard.id);
    const store = createMockStore({ [key]: "native_evt_101" });
    const updateSpy = vi.fn().mockResolvedValue(undefined);
    const createSpy = vi.fn();
    const calendar = createMockCalendarModule({
      updateEvent: updateSpy,
      createEvent: createSpy,
    });

    const result = await addToCalendar(confirmedCard, { store, calendar });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.status).toBe("already_added");
      expect(result.calendarEventId).toBe("native_evt_101");
    }
    expect(updateSpy).toHaveBeenCalledWith("native_evt_101", expect.objectContaining({
      title: "Dinner at Latin House Grill",
      location: "Latin House Grill",
    }));
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("updates calendar event location on venue swap", async () => {
    const key = calendarEventStorageKey(confirmedCard.id);
    const store = createMockStore({ [key]: "native_evt_101" });
    const updateSpy = vi.fn().mockResolvedValue(undefined);
    const calendar = createMockCalendarModule({ updateEvent: updateSpy });

    const swappedCard: EventCardPayload = {
      ...confirmedCard,
      outcome: {
        ...confirmedCard.outcome!,
        venue: {
          ...confirmedCard.outcome!.venue!,
          name: "Sergio's",
        },
      },
    };

    const result = await syncCalendarOnSwap(swappedCard, { store, calendar });

    expect(result?.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith("native_evt_101", expect.objectContaining({
      title: "Dinner at Sergio's",
      location: "Sergio's",
    }));
  });

  it("syncCalendarOnSwap returns null if event was never added previously", async () => {
    const store = createMockStore();
    const calendar = createMockCalendarModule();

    const swappedCard: EventCardPayload = {
      ...confirmedCard,
      outcome: {
        ...confirmedCard.outcome!,
        venue: {
          ...confirmedCard.outcome!.venue!,
          name: "Sergio's",
        },
      },
    };

    const result = await syncCalendarOnSwap(swappedCard, { store, calendar });
    expect(result).toBeNull();
  });

  it("re-creates event if updateEvent fails because event was deleted from device calendar", async () => {
    const key = calendarEventStorageKey(confirmedCard.id);
    const store = createMockStore({ [key]: "deleted_evt_999" });
    const updateSpy = vi.fn().mockRejectedValue(new Error("Event not found"));
    const createSpy = vi.fn().mockResolvedValue("new_evt_202");
    const calendar = createMockCalendarModule({
      updateEvent: updateSpy,
      createEvent: createSpy,
    });

    const result = await addToCalendar(confirmedCard, { store, calendar });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.status).toBe("created");
      expect(result.calendarEventId).toBe("new_evt_202");
    }
    expect(createSpy).toHaveBeenCalled();
    expect(await store.getItemAsync(key)).toBe("new_evt_202");
  });
});
