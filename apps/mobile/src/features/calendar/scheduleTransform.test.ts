import { describe, it, expect } from "vitest";
import { transformScheduleItems } from "./scheduleTransform";
import type { EventCardPayload } from "@web/contract";

describe("scheduleTransform", () => {
  it("transforms and groups free windows, busy blocks and web hangouts chronologically", () => {
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

    const result = transformScheduleItems(freeWindows, events as EventCardPayload[], busyBlocks);
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
});
