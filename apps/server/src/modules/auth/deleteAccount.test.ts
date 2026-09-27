import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { signToken } from "../../lib/auth";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const CAROL = "33333333-3333-4333-8333-333333333333";
const SQUAD_ID = "44444444-4444-4444-8444-444444444444";

interface UserRecord {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  passwordChangedAt: Date | null;
  emailVerifiedAt: Date | null;
}

interface FriendshipRecord {
  id: string;
  userLowId: string;
  userHighId: string;
  status: "pending" | "accepted";
  requestedById: string | null;
  requestedAt: Date;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  lowAddedHigh: boolean;
  highAddedLow: boolean;
}

interface SquadRecord {
  id: string;
  name: string;
  createdBy: string;
}

interface SquadMemberRecord {
  id: string;
  groupId: string;
  userId: string;
  status: "active" | "invited";
  role: string;
  invitedById: string | null;
  invitedAt: Date | null;
  acceptedAt: Date | null;
}

interface EventParticipantRecord {
  id: string;
  eventId: string;
  userId: string;
  voteStatus: "invited" | "voted" | "confirmed" | "ghost_passed";
  inviteSource: "creator" | "direct" | "squad" | null;
  sourceGroupIds: string[];
}

interface EventRecord {
  id: string;
  isMixer: boolean;
  groupKey: string;
  sourceGroupId: string | null;
  sourceGroupIds: string[];
  createdById: string | null;
  status: "voting" | "confirmed" | "chatted" | "expired" | "completed";
  startsAt: Date;
  endsAt: Date;
  vibeTag: "quick_coffee" | "casual_hangout" | "dinner" | "night_out";
  timezone: string;
  venuePlaceId: string | null;
  venueName: string | null;
  venueLat: number | null;
  venueLng: number | null;
  venueStatus: "open" | "reported_closed";
  venueSnapshot: any;
  backupVenues: any[];
  voteClosesAt: Date;
  createdAt: Date;
  resolvedAt: Date | null;
  matchReason: string | null;
}

interface VoteRecord {
  id: string;
  eventId: string;
  userId: string;
  optionId: string;
}

const mockDb = vi.hoisted(() => ({
  users: [] as UserRecord[],
  friendships: [] as FriendshipRecord[],
  groups: [] as SquadRecord[],
  groupMembers: [] as SquadMemberRecord[],
  events: [] as EventRecord[],
  eventParticipants: [] as EventParticipantRecord[],
  eventOptions: [] as any[],
  votes: [] as VoteRecord[],
  chatMessages: [] as any[],
  eventNominations: [] as any[],
  userFavorites: [] as any[],
  busyBlocks: [] as any[],
  googleCalendarConnections: [] as any[],
  pushTokens: [] as any[],
  emailCodes: [] as any[],
  expenses: [] as any[],
  expenseSplits: [] as any[],
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    $transaction: async (arg: any) => {
      if (typeof arg === "function") {
        return arg(mockPrisma);
      }
      return Promise.all(arg);
    },
    get user() { return mockPrisma.user; },
    get friendship() { return mockPrisma.friendship; },
    get explicitGroup() { return mockPrisma.explicitGroup; },
    get groupMember() { return mockPrisma.groupMember; },
    get event() { return mockPrisma.event; },
    get eventParticipant() { return mockPrisma.eventParticipant; },
    get eventOption() { return mockPrisma.eventOption; },
    get vote() { return mockPrisma.vote; },
    get chatMessage() { return mockPrisma.chatMessage; },
    get eventNomination() { return mockPrisma.eventNomination; },
    get userFavorite() { return mockPrisma.userFavorite; },
    get busyBlock() { return mockPrisma.busyBlock; },
    get googleCalendarConnection() { return mockPrisma.googleCalendarConnection; },
    get pushToken() { return mockPrisma.pushToken; },
    get emailCode() { return mockPrisma.emailCode; },
    get expense() { return mockPrisma.expense; },
    get expenseSplit() { return mockPrisma.expenseSplit; },
  },
}));

const mockPrisma: any = {
  $transaction: async (arg: any) => {
    if (typeof arg === "function") return arg(mockPrisma);
    return Promise.all(arg);
  },
  user: {
    findUnique: async ({ where }: any) => {
      const u = mockDb.users.find((x) => (where.id && x.id === where.id) || (where.username && x.username === where.username));
      return u ? { ...u } : null;
    },
    findFirst: async ({ where }: any) => {
      const u = mockDb.users.find((x) => (where.id && x.id === where.id) || (where.username && x.username === where.username));
      return u ? { ...u } : null;
    },
    findMany: async ({ where }: any) => {
      return mockDb.users.filter((u) => {
        if (where?.id?.in && !where.id.in.includes(u.id)) return false;
        if (where?.id?.not && u.id === where.id.not) return false;
        return true;
      });
    },
    delete: async ({ where }: any) => {
      const idx = mockDb.users.findIndex((u) => u.id === where.id);
      if (idx !== -1) mockDb.users.splice(idx, 1);
    },
  },
  friendship: {
    findMany: async ({ where, include }: any) => {
      return mockDb.friendships
        .filter((f) => {
          if (where.status && f.status !== where.status) return false;
          if (where.OR) {
            const matchesOr = where.OR.some((or: any) =>
              (or.userLowId === f.userLowId && or.userHighId === f.userHighId) ||
              (or.userLowId && f.userLowId === or.userLowId) ||
              (or.userHighId && f.userHighId === or.userHighId)
            );
            if (!matchesOr) return false;
          }
          return true;
        })
        .map((f) => {
          if (include?.withUsers || (include?.userLow && include?.userHigh)) {
            const userLow = mockDb.users.find((u) => u.id === f.userLowId);
            const userHigh = mockDb.users.find((u) => u.id === f.userHighId);
            // Replicate Prisma's behavior on missing relation: throw Inconsistent query result!
            if (!userLow || !userHigh) {
              throw new Error("Inconsistent query result: Field user is required to return data, got null instead");
            }
            return { ...f, userLow, userHigh };
          }
          return { ...f };
        });
    },
    deleteMany: async ({ where }: any) => {
      const initial = mockDb.friendships.length;
      mockDb.friendships = mockDb.friendships.filter((f) => {
        if (where.OR) {
          const match = where.OR.some((or: any) =>
            (or.userLowId && f.userLowId === or.userLowId) ||
            (or.userHighId && f.userHighId === or.userHighId)
          );
          if (match) return false;
        }
        return true;
      });
      return { count: initial - mockDb.friendships.length };
    },
  },
  explicitGroup: {
    findMany: async ({ where }: any) => {
      if (where?.members?.some?.userId) {
        const uId = where.members.some.userId;
        const matchingGroupIds = mockDb.groupMembers.filter((m) => m.userId === uId).map((m) => m.groupId);
        return mockDb.groups.filter((g) => matchingGroupIds.includes(g.id)).map((g) => ({ id: g.id, name: g.name }));
      }
      if (where?.createdBy) {
        return mockDb.groups.filter((g) => g.createdBy === where.createdBy);
      }
      return mockDb.groups;
    },
    findUniqueOrThrow: async ({ where, include }: any) => {
      const g = mockDb.groups.find((x) => x.id === where.id);
      if (!g) throw new Error("not_found");
      const members = mockDb.groupMembers.filter((m) => m.groupId === g.id).map((m) => {
        if (include?.members?.include?.user) {
          const u = mockDb.users.find((user) => user.id === m.userId);
          if (!u) {
            throw new Error("Inconsistent query result: Field user is required to return data, got null instead");
          }
          return { ...m, user: u };
        }
        return m;
      });
      return { ...g, members };
    },
    update: async ({ where, data }: any) => {
      const g = mockDb.groups.find((x) => x.id === where.id);
      if (g) Object.assign(g, data);
      return g;
    },
    delete: async ({ where }: any) => {
      const idx = mockDb.groups.findIndex((x) => x.id === where.id);
      if (idx !== -1) mockDb.groups.splice(idx, 1);
    },
    deleteMany: async ({ where }: any) => {
      const initial = mockDb.groups.length;
      mockDb.groups = mockDb.groups.filter((x) => x.id !== where.id);
      return { count: initial - mockDb.groups.length };
    },
  },
  groupMember: {
    findMany: async ({ where }: any) => {
      return mockDb.groupMembers.filter((m) => {
        if (where?.userId && m.userId !== where.userId) return false;
        return true;
      });
    },
    findFirst: async ({ where }: any) => {
      return mockDb.groupMembers.find((m) => {
        if (where.groupId && m.groupId !== where.groupId) return false;
        if (where.status && m.status !== where.status) return false;
        if (where.userId?.not && m.userId === where.userId.not) return false;
        return true;
      }) ?? null;
    },
    count: async ({ where }: any) => {
      return mockDb.groupMembers.filter((m) => {
        if (where.groupId && m.groupId !== where.groupId) return false;
        if (where.status && m.status !== where.status) return false;
        return true;
      }).length;
    },
    deleteMany: async ({ where }: any) => {
      const initial = mockDb.groupMembers.length;
      mockDb.groupMembers = mockDb.groupMembers.filter((m) => {
        if (where.userId && m.userId === where.userId) return false;
        if (where.groupId && m.groupId === where.groupId) return false;
        return true;
      });
      return { count: initial - mockDb.groupMembers.length };
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const m of mockDb.groupMembers) {
        if (where.invitedById && m.invitedById === where.invitedById) {
          Object.assign(m, data);
          count++;
        }
      }
      return { count };
    },
  },
  event: {
    findMany: async ({ where, include }: any) => {
      const userFilter = where?.participants?.some?.userId;
      const matchedEvents = mockDb.events.filter((e) => {
        if (userFilter) {
          const inEvent = mockDb.eventParticipants.some((p) => p.eventId === e.id && p.userId === userFilter);
          if (!inEvent) return false;
        }
        return true;
      });

      return matchedEvents.map((e) => {
        const participants = mockDb.eventParticipants
          .filter((p) => p.eventId === e.id)
          .map((p) => {
            if (include?.participants?.include?.user) {
              const u = mockDb.users.find((user) => user.id === p.userId);
              if (!u) {
                throw new Error("Inconsistent query result: Field user is required to return data, got null instead");
              }
              return { ...p, user: u };
            }
            return p;
          });
        const options = mockDb.eventOptions.filter((o) => o.eventId === e.id);
        const votes = mockDb.votes.filter((v) => v.eventId === e.id);
        return { ...e, participants, options, votes };
      });
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const e of mockDb.events) {
        if (where.createdById && e.createdById === where.createdById) {
          Object.assign(e, data);
          count++;
        }
        if (where.sourceGroupId && e.sourceGroupId === where.sourceGroupId) {
          Object.assign(e, data);
          count++;
        }
      }
      return { count };
    },
  },
  eventParticipant: {
    deleteMany: async ({ where }: any) => {
      const initial = mockDb.eventParticipants.length;
      mockDb.eventParticipants = mockDb.eventParticipants.filter((p) => p.userId !== where.userId);
      return { count: initial - mockDb.eventParticipants.length };
    },
  },
  vote: {
    deleteMany: async ({ where }: any) => {
      const initial = mockDb.votes.length;
      mockDb.votes = mockDb.votes.filter((v) => v.userId !== where.userId);
      return { count: initial - mockDb.votes.length };
    },
  },
  chatMessage: {
    deleteMany: async ({ where }: any) => ({ count: 0 }),
  },
  eventNomination: {
    deleteMany: async ({ where }: any) => ({ count: 0 }),
  },
  userFavorite: {
    deleteMany: async ({ where }: any) => ({ count: 0 }),
  },
  busyBlock: {
    deleteMany: async ({ where }: any) => ({ count: 0 }),
  },
  googleCalendarConnection: {
    deleteMany: async ({ where }: any) => ({ count: 0 }),
  },
  pushToken: {
    deleteMany: async ({ where }: any) => ({ count: 0 }),
  },
  emailCode: {
    deleteMany: async ({ where }: any) => ({ count: 0 }),
  },
  expense: {
    findMany: async () => [],
    deleteMany: async () => ({ count: 0 }),
  },
  expenseSplit: {
    deleteMany: async () => ({ count: 0 }),
  },
};

import { deleteAccount } from "./deleteAccount";
import { createApp } from "../../app";

describe("account deletion cleanup (#353)", () => {
  let base = "";
  let closeServer: () => void;

  beforeAll(async () => {
    const app = createApp();
    const server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    closeServer = () => server.close();
  });

  afterAll(() => closeServer());

  beforeEach(() => {
    // Populate DB: Alice, Bob, Carol
    mockDb.users = [
      { id: ALICE, username: "alice", email: "alice@test.local", displayName: "Alice A", passwordChangedAt: null, emailVerifiedAt: new Date() },
      { id: BOB, username: "bob", email: "bob@test.local", displayName: "Bob B", passwordChangedAt: null, emailVerifiedAt: new Date() },
      { id: CAROL, username: "carol", email: "carol@test.local", displayName: "Carol C", passwordChangedAt: null, emailVerifiedAt: new Date() },
    ];

    // Friendships: Alice-Bob, Alice-Carol
    mockDb.friendships = [
      {
        id: "f-ab",
        userLowId: ALICE,
        userHighId: BOB,
        status: "accepted",
        requestedById: ALICE,
        requestedAt: new Date(),
        acceptedAt: new Date(),
        declinedAt: null,
        lowAddedHigh: true,
        highAddedLow: true,
      },
      {
        id: "f-ac",
        userLowId: ALICE,
        userHighId: CAROL,
        status: "accepted",
        requestedById: ALICE,
        requestedAt: new Date(),
        acceptedAt: new Date(),
        declinedAt: null,
        lowAddedHigh: true,
        highAddedLow: true,
      },
    ];

    // Squad: Bob created Squad S with Alice and Bob as active members
    mockDb.groups = [
      { id: SQUAD_ID, name: "Weekend Crew", createdBy: BOB },
    ];
    mockDb.groupMembers = [
      { id: "m-1", groupId: SQUAD_ID, userId: BOB, status: "active", role: "member", invitedById: null, invitedAt: new Date(), acceptedAt: new Date() },
      { id: "m-2", groupId: SQUAD_ID, userId: ALICE, status: "active", role: "member", invitedById: BOB, invitedAt: new Date(), acceptedAt: new Date() },
    ];

    // Event: Alice and Bob in confirmed dinner hangout
    const now = new Date();
    mockDb.events = [
      {
        id: "00000000-0000-4000-8000-000000000099",
        isMixer: false,
        groupKey: `${ALICE},${BOB}`,
        sourceGroupId: SQUAD_ID,
        sourceGroupIds: [SQUAD_ID],
        createdById: BOB,
        status: "confirmed",
        startsAt: new Date(now.getTime() + 86400000),
        endsAt: new Date(now.getTime() + 90000000),
        vibeTag: "dinner",
        timezone: "America/New_York",
        venuePlaceId: "place-1",
        venueName: "Nice Bistro",
        venueLat: 40.7,
        venueLng: -74.0,
        venueStatus: "open",
        venueSnapshot: {
          id: "00000000-0000-4000-8000-000000000001",
          place_id: "place-1",
          name: "Nice Bistro",
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
          facts_line: "$$ · Bistro",
          ai_blurb: null,
        },
        backupVenues: [],
        voteClosesAt: new Date(now.getTime() - 3600000),
        createdAt: new Date(now.getTime() - 7200000),
        resolvedAt: new Date(now.getTime() - 3600000),
        matchReason: null,
      },
    ];

    mockDb.eventParticipants = [
      { id: "ep-1", eventId: "00000000-0000-4000-8000-000000000099", userId: ALICE, voteStatus: "confirmed", inviteSource: "squad", sourceGroupIds: [SQUAD_ID] },
      { id: "ep-2", eventId: "00000000-0000-4000-8000-000000000099", userId: BOB, voteStatus: "confirmed", inviteSource: "creator", sourceGroupIds: [SQUAD_ID] },
    ];

    mockDb.eventOptions = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        eventId: "00000000-0000-4000-8000-000000000099",
        rank: 1,
        placeId: "place-1",
        name: "Nice Bistro",
        lat: 40.7,
        lng: -74.0,
        primaryType: "restaurant",
        priceLevel: 2,
        rating: 4.5,
        userRatingCount: 100,
        travelMinutes: {},
        maxTravelMin: 15,
        routeScore: 10,
        factsLine: "$$ · Bistro",
        aiBlurb: null,
        activity: null,
        startsAt: null,
        endsAt: null,
      },
    ];

    mockDb.votes = [
      { id: "v-1", eventId: "00000000-0000-4000-8000-000000000099", userId: ALICE, optionId: "00000000-0000-4000-8000-000000000001" },
      { id: "v-2", eventId: "00000000-0000-4000-8000-000000000099", userId: BOB, optionId: "00000000-0000-4000-8000-000000000001" },
    ];
  });

  it("deleting user removes dependent records and leaves other users' GET /events, GET /squads, and GET /friends intact", async () => {
    // Delete Bob's account
    await deleteAccount(BOB);

    // Verify Bob is deleted
    expect(mockDb.users.find((u) => u.id === BOB)).toBeUndefined();
    expect(mockDb.eventParticipants.find((p) => p.userId === BOB)).toBeUndefined();
    expect(mockDb.groupMembers.find((m) => m.userId === BOB)).toBeUndefined();
    expect(mockDb.friendships.find((f) => f.userLowId === BOB || f.userHighId === BOB)).toBeUndefined();
    expect(mockDb.votes.find((v) => v.userId === BOB)).toBeUndefined();

    // Squad ownership transferred to remaining active member (Alice)
    expect(mockDb.groups.find((g) => g.id === SQUAD_ID)?.createdBy).toBe(ALICE);

    // Alice requests GET /events: must succeed without throwing Prisma 500
    const aliceToken = signToken(ALICE);
    const eventsRes = await fetch(`${base}/api/v1/events`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    expect(eventsRes.status).toBe(200);
    const eventsData = await eventsRes.json();
    expect(eventsData.events).toHaveLength(1);
    // Alice is the only remaining participant in the event
    expect(eventsData.events[0].participants.map((p: any) => p.id)).toEqual([ALICE]);

    // Alice requests GET /squads: must succeed without throwing Prisma 500
    const squadsRes = await fetch(`${base}/api/v1/squads`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    expect(squadsRes.status).toBe(200);
    const squadsData = await squadsRes.json();
    expect(squadsData.squads).toHaveLength(1);
    expect(squadsData.squads[0].members.map((m: any) => m.id)).toEqual([ALICE]);

    // Alice requests GET /friends: must succeed without throwing Prisma 500
    const friendsRes = await fetch(`${base}/api/v1/friends`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    expect(friendsRes.status).toBe(200);
    const friendsData = await friendsRes.json();
    // Only Carol remains
    expect(friendsData.friends.map((f: any) => f.id)).toEqual([CAROL]);
  });

  it("DELETE /me removes account and cascades dependent records", async () => {
    const bobToken = signToken(BOB);
    const delRes = await fetch(`${base}/api/v1/me`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${bobToken}` },
    });
    expect(delRes.status).toBe(204);

    expect(mockDb.users.find((u) => u.id === BOB)).toBeUndefined();
    expect(mockDb.eventParticipants.find((p) => p.userId === BOB)).toBeUndefined();
    expect(mockDb.groupMembers.find((m) => m.userId === BOB)).toBeUndefined();
  });
});
