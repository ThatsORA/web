import { describe, expect, it } from "vitest";
import { EventCardPayload, ExpoPushToken, LoginRequest, SignupRequest, optionFromRow, type OptionRowLike } from "./schemas";
import { EventCreatedPayload, EventMessagePayload, EventProgressPayload, EventResolvedPayload, EventVenueChangedPayload } from "./socket";

describe("EventCardPayload match reason", () => {
  it("accepts null or a reason up to 90 characters", () => {
    expect(EventCardPayload.shape.match_reason.safeParse(null).success).toBe(true);
    expect(EventCardPayload.shape.match_reason.safeParse("A shared restaurant favorite fits Thursday dinner.").success).toBe(true);
    expect(EventCardPayload.shape.match_reason.safeParse("x".repeat(91)).success).toBe(false);
  });
});

describe("auth identifiers", () => {
  it("LoginRequest trims and lowercases the identifier and rejects a blank one", () => {
    expect(LoginRequest.parse({ identifier: "  Ojas@Example.COM ", password: "x" }).identifier).toBe("ojas@example.com");
    expect(LoginRequest.parse({ identifier: " OJAS ", password: "x" }).identifier).toBe("ojas");
    expect(LoginRequest.safeParse({ identifier: "   ", password: "x" }).success).toBe(false);
  });
  it("SignupRequest stores the email lowercased", () => {
    const body = { email: " Andy@X.com ", username: "andy", password: "longenough", timezone: "America/New_York" };
    expect(SignupRequest.parse(body).email).toBe("andy@x.com");
  });
});

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

describe("ExpoPushToken", () => {
  it.each(["ExpoPushToken[current-token_123]", "ExponentPushToken[legacy-token-123]"])("accepts %s", (token) => {
    expect(ExpoPushToken.parse(token)).toBe(token);
  });

  it.each(["not-an-expo-token", "ExpoPushToken[]", "ExpoPushToken[token with spaces]", "OtherPushToken[token]"])(
    "rejects %s",
    (token) => {
      expect(ExpoPushToken.safeParse(token).success).toBe(false);
    },
  );
});

describe("event socket payloads (#206)", () => {
  it("never name a person, so no socket event can reveal a roster or a ghost pass", () => {
    const allowed = ["event_id", "responded", "total", "status"];
    for (const payload of [EventCreatedPayload, EventProgressPayload, EventResolvedPayload, EventVenueChangedPayload, EventMessagePayload]) {
      expect(Object.keys(payload.shape).filter((key) => !allowed.includes(key))).toEqual([]);
    }
  });
});
