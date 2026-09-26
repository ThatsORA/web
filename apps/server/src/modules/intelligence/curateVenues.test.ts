import { describe, expect, it } from "vitest";
import type { RankedVenue } from "@web/contract";
import { factsLine, fallbackOptions } from "./curateVenues";

const venue = (id: string, route_score: number, max: number): RankedVenue => ({
  place_id: id,
  name: id,
  lat: 25.757,
  lng: -80.375,
  primary_type: "restaurant",
  price_level: 2,
  rating: 4.6,
  user_rating_count: 120,
  travel_minutes: {},
  max_travel_min: max,
  route_score,
});

describe("fallbackOptions", () => {
  it("picks the 3 lowest route scores, ranked 1..3, no blurbs", () => {
    const out = fallbackOptions([venue("a", 56, 50), venue("b", 26, 20), venue("c", 30, 22), venue("d", 40, 30)]);
    expect(out.map((o) => o.place_id)).toEqual(["b", "c", "d"]);
    expect(out.map((o) => o.rank)).toEqual([1, 2, 3]);
    expect(out.every((o) => o.ai_blurb === null)).toBe(true);
  });

  it("formats the facts line", () => {
    expect(factsLine(venue("x", 20, 14))).toBe("★4.6 · $$ · max 14 min travel");
  });
});
