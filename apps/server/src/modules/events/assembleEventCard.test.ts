import { describe, expect, it } from "vitest";
import { assembleEventCard, type EventWithCardData } from "./assembleEventCard";

describe("assembleEventCard", () => {
  const alice = "11111111-1111-4111-8111-111111111111";
  const bob = "22222222-2222-4222-8222-222222222222";
  const carol = "33333333-3333-4333-8333-333333333333";
  const now = new Date("2026-10-01T12:00:00.000Z");
  const startsAt = new Date("2026-10-02T18:00:00.000Z");
  const endsAt = new Date("2026-10-02T20:00:00.000Z");
  const voteClosesAt = new Date("2026-10-01T10:00:00.000Z");

  const makeUser = (id: string, name: string) => ({
    id,
    username: name.toLowerCase(),
    displayName: name,
  });

  const eventId = "00000000-0000-4000-8000-000000000099";

  const baseEvent: EventWithCardData = {
    id: eventId,
    groupKey: `${alice},${bob}`,
    status: "confirmed",
    isMixer: false,
    startsAt,
    endsAt,
    timezone: "America/New_York",
    vibeTag: "dinner",
    matchReason: null,
    backupVenues: [],
    createdById: null,
    sourceGroupId: "squad-1",
    sourceGroupIds: ["squad-1"],
    venuePlaceId: "place-1",
    venueName: "Nice Diner",
    venueLat: 40.7,
    venueLng: -74.0,
    venueStatus: "open",
    venueSnapshot: {
      id: "00000000-0000-4000-8000-000000000001",
      place_id: "place-1",
      name: "Nice Diner",
      lat: 40.7,
      lng: -74.0,
      primary_type: "restaurant",
      price_level: 2,
      rating: 4.5,
      user_rating_count: 100,
      travel_minutes: {},
      max_travel_min: 15,
      rank: 1,
      route_score: 10,
      facts_line: "$$ · Diner",
      ai_blurb: null,
    },
    resolvedAt: voteClosesAt,
    voteClosesAt,
    createdAt: new Date("2026-10-01T08:00:00.000Z"),
    participants: [
      {
        id: "p-1",
        eventId: eventId,
        userId: alice,
        voteStatus: "confirmed",
        inviteSource: "squad",
        sourceGroupIds: ["squad-1"],
        user: makeUser(alice, "Alice"),
      },
      {
        id: "p-2",
        eventId: eventId,
        userId: bob,
        voteStatus: "confirmed",
        inviteSource: "squad",
        sourceGroupIds: ["squad-1"],
        user: makeUser(bob, "Bob"),
      },
      {
        id: "p-3",
        eventId: eventId,
        userId: carol,
        voteStatus: "invited",
        inviteSource: "direct",
        sourceGroupIds: [`invited_by:${alice}`],
        user: makeUser(carol, "Carol"),
      },
    ],
    options: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        eventId: eventId,
        placeId: "place-1",
        name: "Nice Diner",
        lat: 40.7,
        lng: -74.0,
        primaryType: "restaurant",
        priceLevel: 2,
        rating: 4.5,
        userRatingCount: 100,
        travelMinutes: {},
        maxTravelMin: 15,
        rank: 1,
        routeScore: 10,
        factsLine: "$$ · Diner",
        aiBlurb: null,
        activity: null,
        startsAt: null,
        endsAt: null,
      },
    ],
    votes: [],
  };

  it("does not collapse effectiveStatus to expired for a late direct invitee on a confirmed hangout", () => {
    const card = assembleEventCard(baseEvent, carol, now);
    expect(card.status).toBe("confirmed");
    expect(card.my_status).toBe("invited");
    // On a confirmed hangout, Carol sees all attendees meeting up (Alice, Bob, Carol)
    expect(card.participants.map((p) => p.id)).toEqual([alice, bob, carol]);
    expect(card.outcome?.attendees.map((p) => p.id)).toEqual([alice, bob, carol]);
  });

  it("collapses effectiveStatus to expired when totalUnpassed < 2", () => {
    const expiredEvent: EventWithCardData = {
      ...baseEvent,
      participants: [
        {
          ...baseEvent.participants[0]!,
          voteStatus: "confirmed",
        },
        {
          ...baseEvent.participants[1]!,
          voteStatus: "ghost_passed",
        },
        {
          ...baseEvent.participants[2]!,
          voteStatus: "ghost_passed",
        },
      ],
    };
    const card = assembleEventCard(expiredEvent, alice, now);
    expect(card.status).toBe("expired");
  });
});
