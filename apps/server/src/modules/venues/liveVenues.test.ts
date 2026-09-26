import { describe, expect, it } from "vitest";
import type { ClassifiedSlot } from "../matching/timeMath";
import {
  filterPlaces,
  isOpenForSlot,
  priceLevel,
  rankRouteMatrix,
  type RouteMatrixElement,
  type VenueCandidate,
} from "./liveVenues";

const slot: ClassifiedSlot = {
  vibe_tag: "dinner",
  start: new Date("2026-10-01T22:30:00Z"),
  end: new Date("2026-10-02T00:30:00Z"),
  durationMinutes: 120,
};

function place(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    displayName: { text: id },
    location: { latitude: 25.75, longitude: -80.37 },
    primaryType: "restaurant",
    priceLevel: "PRICE_LEVEL_MODERATE",
    rating: 4.5,
    userRatingCount: 100,
    businessStatus: "OPERATIONAL",
    regularOpeningHours: {
      periods: [{ open: { day: 4, hour: 17 }, close: { day: 4, hour: 23 } }],
    },
    ...overrides,
  };
}

describe("venue filtering", () => {
  it("maps the Places price enum to the contract's 1–4 range", () => {
    expect(priceLevel("PRICE_LEVEL_FREE")).toBe(1);
    expect(priceLevel("PRICE_LEVEL_INEXPENSIVE")).toBe(1);
    expect(priceLevel("PRICE_LEVEL_MODERATE")).toBe(2);
    expect(priceLevel("PRICE_LEVEL_EXPENSIVE")).toBe(3);
    expect(priceLevel("PRICE_LEVEL_VERY_EXPENSIVE")).toBe(4);
    expect(priceLevel(undefined)).toBeNull();
  });

  it("requires the place to stay open through the whole slot", () => {
    expect(isOpenForSlot(
      [{ open: { day: 4, hour: 17 }, close: { day: 4, hour: 21 } }],
      slot,
      "America/New_York",
    )).toBe(true);
    expect(isOpenForSlot(
      [{ open: { day: 4, hour: 17 }, close: { day: 4, hour: 20 } }],
      slot,
      "America/New_York",
    )).toBe(false);
    expect(isOpenForSlot(undefined, slot, "America/New_York")).toBe(true);
  });

  it("filters status, hours, and price before relaxing sparse rating results", () => {
    const places = [
      place("high-rated"),
      place("low-rated", { rating: 3.7, userRatingCount: 10 }),
      place("closed", { businessStatus: "CLOSED_TEMPORARILY" }),
      place("closes-early", {
        regularOpeningHours: { periods: [{ open: { day: 4, hour: 17 }, close: { day: 4, hour: 19 } }] },
      }),
      place("too-pricey", { priceLevel: "PRICE_LEVEL_VERY_EXPENSIVE" }),
    ];
    expect(filterPlaces(places, slot, "America/New_York", [2, 3]).map((item) => item.id)).toEqual([
      "high-rated",
      "low-rated",
    ]);
  });

  it("keeps the rating threshold when at least five venues meet it", () => {
    const places = [
      ...Array.from({ length: 5 }, (_, index) => place(`rated-${index}`)),
      place("low-rated", { rating: 3.9, userRatingCount: 500 }),
    ];
    expect(filterPlaces(places, slot, "America/New_York", [2, 3])).toHaveLength(5);
  });
});

describe("route ranking", () => {
  it("optimizes the worst commute and drops unreachable destinations", () => {
    const candidates: VenueCandidate[] = [
      { place_id: "uneven", name: "Uneven", lat: 1, lng: 1, primary_type: "restaurant", price_level: 2, rating: 4.5, user_rating_count: 100 },
      { place_id: "fair", name: "Fair", lat: 2, lng: 2, primary_type: "restaurant", price_level: 2, rating: 4.4, user_rating_count: 100 },
      { place_id: "unreachable", name: "No Route", lat: 3, lng: 3, primary_type: "restaurant", price_level: 2, rating: 4.8, user_rating_count: 100 },
    ];
    const members = [{ id: "11111111-1111-4111-8111-111111111111" }, { id: "22222222-2222-4222-8222-222222222222" }, { id: "33333333-3333-4333-8333-333333333333" }];
    const route = (originIndex: number, destinationIndex: number, minutes: number): RouteMatrixElement => ({
      originIndex,
      destinationIndex,
      status: {},
      condition: "ROUTE_EXISTS",
      duration: `${minutes * 60}s`,
    });
    const elements = [
      route(0, 0, 5), route(1, 0, 5), route(2, 0, 50),
      route(0, 1, 20), route(1, 1, 20), route(2, 1, 20),
      route(0, 2, 4), route(1, 2, 4),
      { originIndex: 2, destinationIndex: 2, status: {}, condition: "ROUTE_NOT_FOUND" },
    ];

    const ranked = rankRouteMatrix(candidates, members, elements);
    expect(ranked.map((venue) => [venue.place_id, venue.route_score])).toEqual([
      ["fair", 26],
      ["uneven", 56],
    ]);
  });
});
