import { describe, it, expect } from "vitest";
import { transformScheduleItems } from "./scheduleTransform";
import type { EventCardPayload } from "@web/contract";

describe("scheduleTransform", () => {
  it("transforms and groups busy blocks and web hangouts chronologically", () => {
    const busyWindows = [
      { starts_at: "2026-10-01T10:00:00.000Z", ends_at: "2026-10-01T11:00:00.000Z" },
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

    const result = transformScheduleItems(busyWindows, events as EventCardPayload[]);
    expect(result.length).toBe(1);
    expect(result[0].dateKey).toBe("2026-10-01");
    expect(result[0].items.length).toBe(2);

    // Busy item first
    expect(result[0].items[0].type).toBe("busy");
    expect(result[0].items[0].title).toBe("Busy");

    // Hangout item second (prominent)
    expect(result[0].items[1].type).toBe("hangout");
    expect(result[0].items[1].title).toBe("Dinner Hangout");
    expect(result[0].items[1].venueName).toBe("Sergio's Pizza");
    expect(result[0].items[1].status).toBe("confirmed");
  });
});
