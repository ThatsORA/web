import { describe, expect, it } from "vitest";
import { CreateEventRequest, EventCardPayload, EventOption, EventViewer, ExpoPushToken, LoginRequest, SignupRequest, optionFromRow, type OptionRowLike } from "./schemas";
import { EventCreatedPayload, EventMessagePayload, EventProgressPayload, EventResolvedPayload, EventVenueChangedPayload } from "./socket";

describe("EventCardPayload match reason", () => {
  it("accepts null or a reason up to 90 characters", () => {
    expect(EventCardPayload.shape.match_reason.safeParse(null).success).toBe(true);
    expect(EventCardPayload.shape.match_reason.safeParse("A shared restaurant favorite fits Thursday dinner.").success).toBe(true);
    expect(EventCardPayload.shape.match_reason.safeParse("x".repeat(91)).success).toBe(false);
  });
});

describe("EventViewer chat (#212)", () => {
  const viewer = { invite_source: "squad", pass_kind: "visible", full_roster: false } as const;

  it("carries open (voting, confirmed, chatted), read_only (after ends_at) or null (no chat, e.g. a Ghost Pass)", () => {
    for (const chat of ["open", "read_only", null]) {
      expect(EventViewer.safeParse({ ...viewer, chat }).success).toBe(true);
    }
  });

  it("is always present and names no people or membership", () => {
    expect(EventViewer.safeParse(viewer).success).toBe(false);
    expect(EventViewer.safeParse({ ...viewer, chat: "member" }).success).toBe(false);
    expect(EventViewer.safeParse({ ...viewer, chat: ["someone"] }).success).toBe(false);
  });
});

describe("CreateEventRequest", () => {
  const person = "11111111-1111-4111-8111-111111111111";
  const squad = "22222222-2222-4222-8222-222222222222";

  it("accepts a squad, a direct person, or both while preserving old person-only requests", () => {
    expect(CreateEventRequest.parse({ squad_ids: [squad] })).toMatchObject({ invitee_ids: [], squad_ids: [squad] });
    expect(CreateEventRequest.parse({ invitee_ids: [person] })).toEqual({ invitee_ids: [person] });
    expect(CreateEventRequest.parse({ invitee_ids: [person], squad_ids: [squad] })).toMatchObject({
      invitee_ids: [person], squad_ids: [squad],
    });
  });

  it("accepts more than five invitees (#364)", () => {
    const invitees = Array.from({ length: 8 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`);
    expect(CreateEventRequest.parse({ invitee_ids: invitees }).invitee_ids).toHaveLength(8);
  });

  it("rejects an empty selection and malformed IDs", () => {
    expect(CreateEventRequest.safeParse({}).success).toBe(false);
    expect(CreateEventRequest.safeParse({ squad_ids: ["bad"] }).success).toBe(false);
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

describe("EventOption (#321)", () => {
  const base = {
    place_id: "p", name: "Movement", lat: 0, lng: 0, primary_type: null, price_level: null, rating: null,
    user_rating_count: null, travel_minutes: {}, max_travel_min: 10, route_score: 10, rank: 1, facts_line: "", ai_blurb: null,
  };
  it("parses an old option without activity or times", () => {
    const option = EventOption.parse(base);
    expect(option.activity).toBeUndefined();
    expect(option.starts_at).toBeUndefined();
  });
  it("parses activity + its own time, trimming the activity", () => {
    const option = EventOption.parse({ ...base, activity: " Bouldering ", starts_at: "2026-10-01T18:30:00-04:00", ends_at: "2026-10-01T20:30:00-04:00" });
    expect(option).toMatchObject({ activity: "Bouldering", starts_at: "2026-10-01T18:30:00-04:00" });
  });
  it("rejects an activity over 40 chars and a time without an offset", () => {
    expect(EventOption.safeParse({ ...base, activity: "x".repeat(41) }).success).toBe(false);
    expect(EventOption.safeParse({ ...base, starts_at: "2026-10-01T18:30:00" }).success).toBe(false);
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

  it("maps activity and the option's own time as UTC instants (#321)", () => {
    const row: OptionRowLike = {
      id: "123e4567-e89b-12d3-a456-426614174000", rank: 1, placeId: "p", name: "Movement", lat: 0, lng: 0,
      primaryType: null, priceLevel: null, rating: null, userRatingCount: null, travelMinutes: {}, maxTravelMin: 10,
      routeScore: 10, factsLine: "", aiBlurb: null,
      activity: "Bouldering", startsAt: new Date("2026-10-01T22:30:00Z"), endsAt: new Date("2026-10-02T00:30:00Z"),
    };
    expect(optionFromRow(row)).toMatchObject({
      activity: "Bouldering", starts_at: "2026-10-01T22:30:00.000Z", ends_at: "2026-10-02T00:30:00.000Z",
    });
    expect(optionFromRow({ ...row, activity: null, startsAt: null, endsAt: null }).starts_at).toBeUndefined();
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
