import { describe, expect, it } from "vitest";
import { optionFromRow, type OptionRowLike } from "./schemas";

describe("optionFromRow", () => {
  it("maps a DB row to a validated EventOption with id", () => {
    const user1Id = "a0000000-0000-4000-8000-000000000001";
    const user2Id = "a0000000-0000-4000-8000-000000000002";
    const mockRow: OptionRowLike = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      rank: 1,
      placeId: "place_123",
      name: "Blue Bottle Coffee",
      lat: 40.7128,
      lng: -74.006,
      primaryType: "cafe",
      priceLevel: 2,
      rating: 4.5,
      userRatingCount: 150,
      travelMinutes: { [user1Id]: 10, [user2Id]: 15 },
      maxTravelMin: 15,
      routeScore: 12.5,
      factsLine: "★4.5 · $$ · max 15 min travel",
      aiBlurb: "Great coffee spot",
    };

    const option = optionFromRow(mockRow);
    expect(option).toEqual({
      id: "123e4567-e89b-12d3-a456-426614174000",
      rank: 1,
      place_id: "place_123",
      name: "Blue Bottle Coffee",
      lat: 40.7128,
      lng: -74.006,
      primary_type: "cafe",
      price_level: 2,
      rating: 4.5,
      user_rating_count: 150,
      travel_minutes: { [user1Id]: 10, [user2Id]: 15 },
      max_travel_min: 15,
      route_score: 12.5,
      facts_line: "★4.5 · $$ · max 15 min travel",
      ai_blurb: "Great coffee spot",
    });
  });
});
