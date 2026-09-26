import { describe, expect, it } from "vitest";
import {
  EventCardPayload,
  ExpoPushRequest,
  ExpoPushResponse,
  ExpoPushToken,
  PutPushTokenRequest,
  optionFromRow,
  type OptionRowLike,
} from "./schemas";

describe("EventCardPayload match reason", () => {
  it("accepts null or a reason up to 90 characters", () => {
    expect(EventCardPayload.shape.match_reason.safeParse(null).success).toBe(true);
    expect(EventCardPayload.shape.match_reason.safeParse("A shared restaurant favorite fits Thursday dinner.").success).toBe(true);
    expect(EventCardPayload.shape.match_reason.safeParse("x".repeat(91)).success).toBe(false);
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

describe("push notification boundaries", () => {
  const eventId = "2b5232d3-9424-4e7c-8e2f-0299693b54eb";

  it.each([
    "ExpoPushToken[current-token_123]",
    "ExponentPushToken[legacy-token-123]",
  ])("accepts the documented Expo token form %s", (token) => {
    expect(ExpoPushToken.parse(token)).toBe(token);
  });

  it.each([
    "not-an-expo-token",
    "ExpoPushToken[]",
    "ExpoPushToken[token with spaces]",
    "OtherPushToken[token]",
  ])("rejects malformed token %s", (token) => {
    expect(ExpoPushToken.safeParse(token).success).toBe(false);
  });

  it("validates registration platform", () => {
    expect(PutPushTokenRequest.parse({ token: "ExpoPushToken[token]", platform: "ios" }))
      .toEqual({ token: "ExpoPushToken[token]", platform: "ios" });
    expect(PutPushTokenRequest.safeParse({ token: "ExpoPushToken[token]", platform: "web" }).success)
      .toBe(false);
  });

  it("strips fields outside the thin event_id payload", () => {
    expect(ExpoPushRequest.parse({
      to: "ExpoPushToken[token]",
      title: "Hangout confirmed",
      body: "Open Web for details.",
      data: { event_id: eventId, responded: 2, total: 3, ghost_user_id: "secret" },
    })).toEqual({
      to: "ExpoPushToken[token]",
      title: "Hangout confirmed",
      body: "Open Web for details.",
      data: { event_id: eventId },
    });
  });

  it("parses success and provider-error ticket arrays", () => {
    const value = {
      data: [
        { status: "ok", id: "ticket-1" },
        { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
      ],
    };
    expect(ExpoPushResponse.parse(value)).toEqual(value);
    expect(ExpoPushResponse.safeParse({ data: [{ status: "maybe" }] }).success).toBe(false);
  });
});
