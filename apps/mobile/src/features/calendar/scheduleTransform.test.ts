import { describe, it, expect } from "vitest";
import { formatDateLabel, formatTimeRange, getDateKey, transformScheduleItems } from "./scheduleTransform";
import type { EventCardPayload } from "@web/contract";

describe("scheduleTransform", () => {
  it("transforms and groups free windows, busy blocks and web hangouts chronologically in UTC", () => {
    const freeWindows = [
      { starts_at: "2026-10-01T09:00:00.000Z", ends_at: "2026-10-01T12:00:00.000Z" },
    ];

    const busyBlocks = [
      { starts_at: "2026-10-01T13:00:00.000Z", ends_at: "2026-10-01T14:00:00.000Z" },
    ];

    const events: Partial<EventCardPayload>[] = [
      {
        id: "evt-101",
        status: "confirmed",
        starts_at: "2026-10-01T18:00:00.000Z",
        ends_at: "2026-10-01T20:00:00.000Z",
        timezone: "America/New_York",
        vibe_tag: "dinner",
        viewer: { invite_source: "creator", pass_kind: "ghost", full_roster: true, chat: null },
        participants: [],
        options: [{ rank: 1, place_id: "p1", name: "Sergio's Pizza", lat: 25.7, lng: -80.3, primary_type: null, price_level: 2, rating: 4.5, user_rating_count: 100, travel_minutes: {}, max_travel_min: 10, route_score: 11, facts_line: "★4.5", ai_blurb: null }],
        progress: { responded: 2, total: 2 },
        my_status: "confirmed",
        my_option_id: null,
        vote_closes_at: "2026-10-01T17:00:00.000Z",
        outcome: {
          venue: { rank: 1, place_id: "p1", name: "Sergio's Pizza", lat: 25.7, lng: -80.3, primary_type: null, price_level: 2, rating: 4.5, user_rating_count: 100, travel_minutes: {}, max_travel_min: 10, route_score: 11, facts_line: "★4.5", ai_blurb: null },
          venue_status: "open",
          attendees: [],
          tallies: null,
        },
      },
    ];

    const result = transformScheduleItems(freeWindows, events as EventCardPayload[], busyBlocks, "UTC");
    expect(result.length).toBe(1);
    expect(result[0].dateKey).toBe("2026-10-01");
    expect(result[0].items.length).toBe(3);

    // Free item first (09:00 - 12:00)
    expect(result[0].items[0].type).toBe("free");
    expect(result[0].items[0].title).toBe("Free");

    // Busy item second (13:00 - 14:00)
    expect(result[0].items[1].type).toBe("busy");
    expect(result[0].items[1].title).toBe("Busy");

    // Hangout item third (18:00 - 20:00)
    expect(result[0].items[2].type).toBe("hangout");
    expect(result[0].items[2].title).toBe("Dinner Hangout");
    expect(result[0].items[2].venueName).toBe("Sergio's Pizza");
    expect(result[0].items[2].status).toBe("confirmed");
  });

  it("groups evening events crossing UTC midnight into user local day in specified timezone", () => {
    // 2026-10-02T01:00:00.000Z is 2026-10-01 21:00:00 (9:00 PM) in America/New_York (EDT, UTC-4)
    const eveningEvent: Partial<EventCardPayload>[] = [
      {
        id: "evt-night",
        status: "confirmed",
        starts_at: "2026-10-02T01:00:00.000Z",
        ends_at: "2026-10-02T03:00:00.000Z",
        timezone: "America/New_York",
        vibe_tag: "night_out",
      },
    ];

    const result = transformScheduleItems([], eveningEvent as EventCardPayload[], [], "America/New_York");
    expect(result.length).toBe(1);
    // Grouped under Oct 1 in New York, not Oct 2
    expect(result[0].dateKey).toBe("2026-10-01");
    expect(result[0].items[0].subtitle).toMatch(/9:00\s?PM\s?–\s?11:00\s?PM/);
  });

  it("computes accurate date labels relative to user timezone", () => {
    // Reference now: 2026-10-01 12:00:00 EDT (16:00:00 UTC)
    const now = new Date("2026-10-01T16:00:00.000Z");

    const todayDate = new Date("2026-10-02T01:00:00.000Z"); // 9:00 PM Oct 1 in NY -> "Today"
    expect(formatDateLabel(todayDate, "America/New_York", now)).toBe("Today");

    const tomorrowDate = new Date("2026-10-02T16:00:00.000Z"); // 12:00 PM Oct 2 in NY -> "Tomorrow"
    expect(formatDateLabel(tomorrowDate, "America/New_York", now)).toBe("Tomorrow");

    const futureDate = new Date("2026-10-05T16:00:00.000Z"); // Oct 5 in NY -> Mon, Oct 5
    expect(formatDateLabel(futureDate, "America/New_York", now)).toBe("Mon, Oct 5");
  });

  it("only transforms confirmed hangouts and filters out voting or cancelled hangouts", () => {
    const events: Partial<EventCardPayload>[] = [
      {
        id: "evt-confirmed",
        status: "confirmed",
        starts_at: "2026-10-01T18:00:00.000Z",
        ends_at: "2026-10-01T20:00:00.000Z",
        vibe_tag: "dinner",
      },
      {
        id: "evt-voting",
        status: "voting",
        starts_at: "2026-10-01T21:00:00.000Z",
        ends_at: "2026-10-01T22:00:00.000Z",
        vibe_tag: "casual_hangout",
      },
      {
        id: "evt-cancelled",
        status: "expired",
        starts_at: "2026-10-01T22:00:00.000Z",
        ends_at: "2026-10-01T23:00:00.000Z",
        vibe_tag: "quick_coffee",
      },
    ];

    const result = transformScheduleItems([], events as EventCardPayload[], []);
    expect(result.length).toBe(1);
    expect(result[0].items.length).toBe(1);
    expect(result[0].items[0].eventId).toBe("evt-confirmed");
    expect(result[0].items[0].status).toBe("confirmed");
  });

  describe("interval reconciliation and overlap removal", () => {
    it("completely removes free window when fully consumed by confirmed hangout", () => {
      const freeWindows = [
        { starts_at: "2026-10-01T18:00:00.000Z", ends_at: "2026-10-01T20:00:00.000Z" },
      ];
      const events: Partial<EventCardPayload>[] = [
        {
          id: "evt-dinner",
          status: "confirmed",
          starts_at: "2026-10-01T18:00:00.000Z",
          ends_at: "2026-10-01T20:00:00.000Z",
          vibe_tag: "dinner",
        },
      ];

      const result = transformScheduleItems(freeWindows, events as EventCardPayload[], [], "UTC");
      expect(result.length).toBe(1);
      // No duplicate "Free" window at the same time as confirmed hangout
      expect(result[0].items.length).toBe(1);
      expect(result[0].items[0].type).toBe("hangout");
      expect(result[0].items[0].eventId).toBe("evt-dinner");
    });

    it("splits free window into before and after when confirmed hangout is in the middle", () => {
      const freeWindows = [
        { starts_at: "2026-10-01T16:00:00.000Z", ends_at: "2026-10-01T22:00:00.000Z" },
      ];
      const events: Partial<EventCardPayload>[] = [
        {
          id: "evt-dinner",
          status: "confirmed",
          starts_at: "2026-10-01T18:00:00.000Z",
          ends_at: "2026-10-01T20:00:00.000Z",
          vibe_tag: "dinner",
        },
      ];

      const result = transformScheduleItems(freeWindows, events as EventCardPayload[], [], "UTC");
      expect(result.length).toBe(1);
      expect(result[0].items.length).toBe(3);

      expect(result[0].items[0].type).toBe("free");
      expect(result[0].items[0].startsAt).toBe("2026-10-01T16:00:00.000Z");
      expect(result[0].items[0].endsAt).toBe("2026-10-01T18:00:00.000Z");

      expect(result[0].items[1].type).toBe("hangout");
      expect(result[0].items[1].eventId).toBe("evt-dinner");

      expect(result[0].items[2].type).toBe("free");
      expect(result[0].items[2].startsAt).toBe("2026-10-01T20:00:00.000Z");
      expect(result[0].items[2].endsAt).toBe("2026-10-01T22:00:00.000Z");
    });

    it("trims free window overlapping with busy block", () => {
      const freeWindows = [
        { starts_at: "2026-10-01T09:00:00.000Z", ends_at: "2026-10-01T13:00:00.000Z" },
      ];
      const busyBlocks = [
        { id: "b1", starts_at: "2026-10-01T11:00:00.000Z", ends_at: "2026-10-01T13:00:00.000Z" },
      ];

      const result = transformScheduleItems(freeWindows, [], busyBlocks, "UTC");
      expect(result.length).toBe(1);
      expect(result[0].items.length).toBe(2);

      expect(result[0].items[0].type).toBe("free");
      expect(result[0].items[0].startsAt).toBe("2026-10-01T09:00:00.000Z");
      expect(result[0].items[0].endsAt).toBe("2026-10-01T11:00:00.000Z");

      expect(result[0].items[1].type).toBe("busy");
      expect(result[0].items[1].startsAt).toBe("2026-10-01T11:00:00.000Z");
      expect(result[0].items[1].endsAt).toBe("2026-10-01T13:00:00.000Z");
    });

    it("suppresses redundant busy blocks that coincide with confirmed hangouts", () => {
      const busyBlocks = [
        { id: "b-sync", starts_at: "2026-10-01T18:00:00.000Z", ends_at: "2026-10-01T20:00:00.000Z" },
      ];
      const events: Partial<EventCardPayload>[] = [
        {
          id: "evt-confirmed",
          status: "confirmed",
          starts_at: "2026-10-01T18:00:00.000Z",
          ends_at: "2026-10-01T20:00:00.000Z",
          vibe_tag: "dinner",
        },
      ];

      const result = transformScheduleItems([], events as EventCardPayload[], busyBlocks, "UTC");
      expect(result.length).toBe(1);
      // Only the confirmed hangout is displayed, avoiding duplicate "Busy" block
      expect(result[0].items.length).toBe(1);
      expect(result[0].items[0].type).toBe("hangout");
    });
  });
});
