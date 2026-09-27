import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../env";
import type { ClassifiedSlot } from "../matching/timeMath";
import { DISCOVERY_FIELD_MASK, discoverPlaces, firstFit, LEISURE_TYPES, openIntervals, timeCandidates, type DiscoveredPlace } from "./discover";

const NY = "America/New_York"; // EDT (UTC-4) in October 2026
const d = (iso: string) => new Date(iso);
// Thu 1 Oct 2026, 18:30–21:00 EDT
const FROM = d("2026-10-01T22:30:00Z");
const TO = d("2026-10-02T01:00:00Z");
const iso = (intervals: { start: Date; end: Date }[]) => intervals.map((i) => [i.start.toISOString(), i.end.toISOString()]);

describe("openIntervals", () => {
  it("clips a same-day period to [from, to]: never before `from` (the slot start)", () => {
    const periods = [{ open: { day: 4, hour: 11 }, close: { day: 4, hour: 20 } }];
    expect(iso(openIntervals(periods, NY, FROM, TO))).toEqual([["2026-10-01T22:30:00.000Z", "2026-10-02T00:00:00.000Z"]]);
  });

  it("reads an overnight period that closes the next day", () => {
    const periods = [{ open: { day: 4, hour: 20, minute: 15 }, close: { day: 5, hour: 2 } }];
    expect(iso(openIntervals(periods, NY, FROM, TO))).toEqual([["2026-10-02T00:15:00.000Z", "2026-10-02T01:00:00.000Z"]]);
  });

  it("wraps Saturday night into Sunday", () => {
    const periods = [{ open: { day: 6, hour: 22 }, close: { day: 0, hour: 2 } }];
    const from = d("2026-10-04T03:00:00Z"); // Sat 23:00 EDT
    const to = d("2026-10-04T05:00:00Z"); // Sun 01:00 EDT
    expect(iso(openIntervals(periods, NY, from, to))).toEqual([[from.toISOString(), to.toISOString()]]);
  });

  it("uses the place's own timezone", () => {
    const periods = [{ open: { day: 4, hour: 17 }, close: { day: 4, hour: 19 } }]; // 17–19 CDT = 22:00–00:00Z
    expect(iso(openIntervals(periods, "America/Chicago", FROM, TO))).toEqual([["2026-10-01T22:30:00.000Z", "2026-10-02T00:00:00.000Z"]]);
  });

  it("merges back-to-back periods; closed that day → nothing", () => {
    const split = [
      { open: { day: 4, hour: 9 }, close: { day: 4, hour: 19 } },
      { open: { day: 4, hour: 19 }, close: { day: 4, hour: 23 } },
    ];
    expect(iso(openIntervals(split, NY, FROM, TO))).toEqual([[FROM.toISOString(), TO.toISOString()]]);
    expect(openIntervals([{ open: { day: 1, hour: 9 }, close: { day: 1, hour: 23 } }], NY, FROM, TO)).toEqual([]);
  });

  it("treats no hours or an always-open period (no close) as open throughout", () => {
    const whole = [[FROM.toISOString(), TO.toISOString()]];
    expect(iso(openIntervals(undefined, NY, FROM, TO))).toEqual(whole);
    expect(iso(openIntervals([{ open: { day: 0, hour: 0 } }], NY, FROM, TO))).toEqual(whole);
  });
});

describe("firstFit", () => {
  const open = [
    { start: d("2026-10-01T22:37:00Z"), end: d("2026-10-02T00:00:00Z") },
    { start: d("2026-10-02T00:20:00Z"), end: d("2026-10-02T01:00:00Z") },
  ];
  it("starts at the first 15-min mark that fits the whole length", () => {
    expect(firstFit(open, 60)).toEqual({ start: d("2026-10-01T22:45:00Z"), end: d("2026-10-01T23:45:00Z") });
    expect(firstFit(open, 75)).toEqual({ start: d("2026-10-01T22:45:00Z"), end: d("2026-10-02T00:00:00Z") });
  });
  it("returns null when no open stretch is long enough", () => {
    expect(firstFit(open, 90)).toBeNull();
  });
});

describe("timeCandidates", () => {
  const venue = (place_id: string, open: { start: Date; end: Date }[]): DiscoveredPlace => ({
    place_id, name: place_id, lat: 0, lng: 0, primary_type: null, price_level: null, rating: null,
    user_rating_count: null, travel_minutes: {}, max_travel_min: 10, route_score: 10, open,
  });
  it("times each place by its typical length, drops the ones that don't fit, and keeps the order", () => {
    const out = timeCandidates(
      [venue("climb", [{ start: FROM, end: TO }]), venue("short", [{ start: FROM, end: d("2026-10-01T23:30:00Z") }])],
      new Map([["climb", { activity: "Bouldering", typical_minutes: 120 }], ["short", { activity: "Tacos", typical_minutes: 90 }]]),
    );
    expect(out).toEqual([expect.objectContaining({
      place_id: "climb", activity: "Bouldering", starts_at: "2026-10-01T22:30:00.000Z", ends_at: "2026-10-02T00:30:00.000Z",
    })]);
    expect(out[0]).not.toHaveProperty("open");
  });
});

describe("discoverPlaces", () => {
  const slot: ClassifiedSlot = { vibe_tag: "dinner", start: FROM, end: d("2026-10-02T00:30:00Z"), durationMinutes: 120 };
  const members = ["a", "b"].map((id, i) => ({
    id, timezone: NY, homeLat: 25.75 + i * 0.01, homeLng: -80.37, favorites: [], travelMode: "DRIVE",
  }));
  const place = (id: string, extra: object = {}) => ({
    id, displayName: { text: id }, location: { latitude: 25.76, longitude: -80.37 },
    primaryType: "bowling_alley", businessStatus: "OPERATIONAL", ...extra,
  });
  const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
    if (String(url).includes("searchNearby")) {
      return new Response(JSON.stringify({ places: [
        place("open-late"),
        place("closed-for-good", { businessStatus: "CLOSED_PERMANENTLY" }),
        place("closes-soon", { regularOpeningHours: { periods: [{ open: { day: 4, hour: 9 }, close: { day: 4, hour: 19 } }] } }),
        place("chicago", { timeZone: { id: "America/Chicago" }, regularOpeningHours: { periods: [{ open: { day: 4, hour: 17 }, close: { day: 4, hour: 22 } }] } }),
      ] }));
    }
    // Destinations in request order: open-late (0), chicago (1). chicago is closer for both.
    const minutes = [[20, 25], [10, 12]];
    return new Response(JSON.stringify([0, 1].flatMap((originIndex) => [0, 1].map((destinationIndex) => ({
      originIndex, destinationIndex, condition: "ROUTE_EXISTS", duration: `${minutes[destinationIndex]![originIndex]! * 60}s`,
    })))));
  });
  const original = env.GOOGLE_MAPS_API_KEY;
  beforeEach(() => {
    env.GOOGLE_MAPS_API_KEY = "maps-key";
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    env.GOOGLE_MAPS_API_KEY = original;
    vi.unstubAllGlobals();
  });

  it("runs one broad search, keeps places open ≥ 45 min in the window and ranks them by worst commute", async () => {
    const out = await discoverPlaces(slot, FROM, TO, members);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("places:searchNearby");
    expect((init!.headers as Record<string, string>)["X-Goog-FieldMask"]).toBe(DISCOVERY_FIELD_MASK);
    expect(DISCOVERY_FIELD_MASK).toContain("places.regularOpeningHours");
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({ includedTypes: LEISURE_TYPES, maxResultCount: 20 });
    expect(LEISURE_TYPES.length).toBeLessThanOrEqual(50);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("searchNearby"))).toHaveLength(1);

    expect(out.map((p) => [p.place_id, p.max_travel_min])).toEqual([["chicago", 12], ["open-late", 25]]);
    expect(iso(out[0]!.open)).toEqual([[FROM.toISOString(), TO.toISOString()]]); // 17–22 CDT covers the window
  });
});
