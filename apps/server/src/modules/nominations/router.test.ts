import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eventFindUnique: vi.fn(),
  participantFindMany: vi.fn(),
  participantCreate: vi.fn(),
  userFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  chatMessageCreate: vi.fn(),
  emitToUsers: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    event: { findUnique: mocks.eventFindUnique },
    eventParticipant: {
      findMany: mocks.participantFindMany,
      create: mocks.participantCreate,
    },
    user: {
      findUnique: mocks.userFindUnique,
      findMany: mocks.userFindMany,
    },
    chatMessage: {
      create: mocks.chatMessageCreate,
    },
  },
}));

vi.mock("../../realtime", () => ({
  emitToUsers: mocks.emitToUsers,
}));

import { nominationsRouter } from "./router";
import { nominationStore } from "./store";
import { computeApprovalThreshold } from "./service";
import { signToken } from "../../lib/auth";

const creatorId = "11111111-1111-4111-8111-111111111111";
const squadMember1 = "22222222-2222-4222-8222-222222222222";
const squadMember2 = "33333333-3333-4333-8333-333333333333";
const squadMember3 = "44444444-4444-4444-8444-444444444444";
const directGuestId = "55555555-5555-4555-8555-555555555555";
const nomineeId = "66666666-6666-4666-8666-666666666666";
const strangerId = "77777777-7777-4777-8777-777777777777";
const eventId = "88888888-8888-4888-8888-888888888888";

const makeEvent = (overrides = {}) => ({
  id: eventId,
  status: "voting",
  createdById: creatorId,
  sourceGroupId: "squad-1",
  sourceGroupIds: ["squad-1"],
  voteClosesAt: new Date(Date.now() + 3600_000),
  endsAt: new Date(Date.now() + 7200_000),
  ...overrides,
});

const makeParticipants = (rows: Array<{ userId: string; voteStatus?: string; inviteSource?: string; sourceGroupIds?: string[] }>) =>
  rows.map((r) => ({
    userId: r.userId,
    voteStatus: r.voteStatus ?? "voted",
    inviteSource: r.inviteSource ?? "squad",
    sourceGroupIds: r.sourceGroupIds ?? ["squad-1"],
    event: {
      createdById: creatorId,
      sourceGroupId: "squad-1",
      sourceGroupIds: ["squad-1"],
    },
  }));

let base: string;
let close: () => void;

beforeAll(async () => {
  const app = express();
  app.use(express.json(), nominationsRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/events/${eventId}`;
  close = () => server.close();
});

afterAll(() => close());

beforeEach(() => {
  vi.clearAllMocks();
  nominationStore.clear();

  mocks.eventFindUnique.mockResolvedValue(makeEvent());
  mocks.participantFindMany.mockResolvedValue(
    makeParticipants([
      { userId: creatorId, inviteSource: "creator", sourceGroupIds: ["squad-1"] },
      { userId: squadMember1, inviteSource: "squad", sourceGroupIds: ["squad-1"] },
    ])
  );
  mocks.userFindUnique.mockImplementation(async ({ where }) => {
    const id = where.id;
    return {
      id,
      username: `user_${id.slice(0, 4)}`,
      displayName: `User ${id.slice(0, 4)}`,
    };
  });
  mocks.userFindMany.mockResolvedValue([]);
  mocks.chatMessageCreate.mockResolvedValue({ id: "msg-1" });
});

const get = (path: string, token = signToken(creatorId)) =>
  fetch(`${base}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });

const post = (path: string, body?: unknown, token = signToken(creatorId)) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("nominations majority threshold logic", () => {
  it("strictly requires more than half of all eligible squad-sourced participants", () => {
    // 1 participant: > 0.5 -> 1 vote
    expect(computeApprovalThreshold(1)).toBe(1);
    // 2 participants: > 1.0 -> 2 votes (1 vote is 50%, not strictly > 50%)
    expect(computeApprovalThreshold(2)).toBe(2);
    // 3 participants: > 1.5 -> 2 votes
    expect(computeApprovalThreshold(3)).toBe(2);
    // 4 participants: > 2.0 -> 3 votes (2 votes is 50%, not strictly > 50%)
    expect(computeApprovalThreshold(4)).toBe(3);
    // 5 participants: > 2.5 -> 3 votes
    expect(computeApprovalThreshold(5)).toBe(3);
    // 6 participants: > 3.0 -> 4 votes
    expect(computeApprovalThreshold(6)).toBe(4);
  });
});

describe("nominationsRouter", () => {
  describe("POST /events/:id/nominations (creating nominations)", () => {
    it("allows an eligible squad-sourced participant to nominate a new person", async () => {
      // 2 eligible squad participants (creatorId, squadMember1) -> threshold is 2
      const res = await post("/nominations", { nominee_id: nomineeId }, signToken(creatorId));
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json).toMatchObject({
        event_id: eventId,
        nominee_id: nomineeId,
        nominated_by_id: creatorId,
        status: "pending",
        votes: [creatorId],
        threshold: 2,
        eligible_count: 2,
      });

      // Emitted system message to chat
      expect(mocks.chatMessageCreate).toHaveBeenCalled();
      expect(mocks.emitToUsers).toHaveBeenCalledWith([squadMember1], "event:message", { event_id: eventId });
    });

    it("automatically approves if 1-person squad (1/1 > half)", async () => {
      mocks.participantFindMany.mockResolvedValueOnce(
        makeParticipants([{ userId: creatorId, inviteSource: "creator", sourceGroupIds: ["squad-1"] }])
      );

      const res = await post("/nominations", { nominee_id: nomineeId }, signToken(creatorId));
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.status).toBe("approved");
      expect(json.threshold).toBe(1);
      expect(json.votes).toEqual([creatorId]);
    });

    it("allows squad members who passed (visible pass) to nominate and be counted", async () => {
      mocks.participantFindMany.mockResolvedValueOnce(
        makeParticipants([
          { userId: creatorId, inviteSource: "creator", sourceGroupIds: ["squad-1"] },
          { userId: squadMember1, voteStatus: "ghost_passed", inviteSource: "squad", sourceGroupIds: ["squad-1"] },
        ])
      );

      // squadMember1 passed, but has visible pass kind, so they retain chat access and can nominate
      const res = await post("/nominations", { nominee_id: nomineeId }, signToken(squadMember1));
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.nominated_by_id).toBe(squadMember1);
      expect(json.eligible_count).toBe(2);
      expect(json.threshold).toBe(2);
    });

    it("rejects nomination by stranger with 403", async () => {
      const res = await post("/nominations", { nominee_id: nomineeId }, signToken(strangerId));
      expect(res.status).toBe(403);
    });

    it("rejects nomination by a direct invitee with 403", async () => {
      mocks.participantFindMany.mockResolvedValueOnce(
        makeParticipants([
          { userId: creatorId, inviteSource: "creator", sourceGroupIds: ["squad-1"] },
          { userId: squadMember1, inviteSource: "squad", sourceGroupIds: ["squad-1"] },
          { userId: directGuestId, inviteSource: "direct", sourceGroupIds: [] },
        ])
      );

      const res = await post("/nominations", { nominee_id: nomineeId }, signToken(directGuestId));
      expect(res.status).toBe(403);
    });

    it("rejects targeting an existing participant with 400", async () => {
      const res = await post("/nominations", { nominee_id: squadMember1 }, signToken(creatorId));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "already_participant" });
    });

    it("rejects duplicate pending/approved nominations with 409", async () => {
      const res1 = await post("/nominations", { nominee_id: nomineeId }, signToken(creatorId));
      expect(res1.status).toBe(201);

      const res2 = await post("/nominations", { nominee_id: nomineeId }, signToken(squadMember1));
      expect(res2.status).toBe(409);
      expect(await res2.json()).toMatchObject({ error: "already_nominated" });
    });

    it("enforces 2-6 person event capacity (cannot exceed 6)", async () => {
      // 6 existing participants
      mocks.participantFindMany.mockResolvedValueOnce(
        makeParticipants([
          { userId: creatorId, inviteSource: "creator" },
          { userId: squadMember1, inviteSource: "squad" },
          { userId: squadMember2, inviteSource: "squad" },
          { userId: squadMember3, inviteSource: "squad" },
          { userId: "u5", inviteSource: "squad" },
          { userId: "u6", inviteSource: "squad" },
        ])
      );

      const res = await post("/nominations", { nominee_id: nomineeId }, signToken(creatorId));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "capacity_exceeded" });
    });

    it("rejects invalid request body with 400", async () => {
      const res = await post("/nominations", { nominee_id: "not-a-uuid" }, signToken(creatorId));
      expect(res.status).toBe(400);
    });
  });

  describe("POST /events/:id/nominations/:nominationId/vote (voting on nominations)", () => {
    it("approves nomination when threshold of more than half is reached", async () => {
      // 3 squad members: threshold is 2 (> 1.5)
      mocks.participantFindMany.mockResolvedValue(
        makeParticipants([
          { userId: creatorId, inviteSource: "creator" },
          { userId: squadMember1, inviteSource: "squad" },
          { userId: squadMember2, inviteSource: "squad" },
        ])
      );

      // Creator nominates -> votes: [creatorId], threshold: 2, status: pending
      const createRes = await post("/nominations", { nominee_id: nomineeId }, signToken(creatorId));
      const nom = await createRes.json();
      expect(nom.status).toBe("pending");
      expect(nom.threshold).toBe(2);

      // squadMember1 votes yes -> votes: [creatorId, squadMember1] -> 2 >= 2 -> approved!
      const voteRes = await post(`/nominations/${nom.id}/vote`, {}, signToken(squadMember1));
      expect(voteRes.status).toBe(200);
      const updated = await voteRes.json();
      expect(updated.status).toBe("approved");
      expect(updated.votes).toEqual([creatorId, squadMember1]);
    });

    it("allows a passed squad member to vote and advance to approval", async () => {
      mocks.participantFindMany.mockResolvedValue(
        makeParticipants([
          { userId: creatorId, inviteSource: "creator" },
          { userId: squadMember1, voteStatus: "ghost_passed", inviteSource: "squad" },
        ])
      );

      const createRes = await post("/nominations", { nominee_id: nomineeId }, signToken(creatorId));
      const nom = await createRes.json();
      expect(nom.status).toBe("pending");

      const voteRes = await post(`/nominations/${nom.id}/vote`, {}, signToken(squadMember1));
      expect(voteRes.status).toBe(200);
      const updated = await voteRes.json();
      expect(updated.status).toBe("approved");
    });

    it("rejects duplicate votes from the same user with 400", async () => {
      mocks.participantFindMany.mockResolvedValue(
        makeParticipants([
          { userId: creatorId, inviteSource: "creator" },
          { userId: squadMember1, inviteSource: "squad" },
          { userId: squadMember2, inviteSource: "squad" },
        ])
      );

      const createRes = await post("/nominations", { nominee_id: nomineeId }, signToken(creatorId));
      const nom = await createRes.json();

      // Creator attempts to vote again
      const voteRes = await post(`/nominations/${nom.id}/vote`, {}, signToken(creatorId));
      expect(voteRes.status).toBe(400);
      expect(await voteRes.json()).toMatchObject({ error: "already_voted" });
    });

    it("rejects votes from a direct invitee or stranger with 403", async () => {
      mocks.participantFindMany.mockResolvedValue(
        makeParticipants([
          { userId: creatorId, inviteSource: "creator" },
          { userId: squadMember1, inviteSource: "squad" },
          { userId: directGuestId, inviteSource: "direct" },
        ])
      );

      const createRes = await post("/nominations", { nominee_id: nomineeId }, signToken(creatorId));
      const nom = await createRes.json();

      expect((await post(`/nominations/${nom.id}/vote`, {}, signToken(directGuestId))).status).toBe(403);
      expect((await post(`/nominations/${nom.id}/vote`, {}, signToken(strangerId))).status).toBe(403);
    });

    it("rejects voting on an already approved nomination with 400", async () => {
      // 1 member -> instantly approved
      mocks.participantFindMany.mockResolvedValue(
        makeParticipants([{ userId: creatorId, inviteSource: "creator" }])
      );

      const createRes = await post("/nominations", { nominee_id: nomineeId }, signToken(creatorId));
      const nom = await createRes.json();
      expect(nom.status).toBe("approved");

      const voteRes = await post(`/nominations/${nom.id}/vote`, {}, signToken(creatorId));
      expect(voteRes.status).toBe(400);
      expect(await voteRes.json()).toMatchObject({ error: "nomination_closed" });
    });
  });

  describe("POST /events/:id/nominations/:nominationId/respond (nominee response)", () => {
    it("adds the accepted invitee with direct inviteSource when venue voting is open", async () => {
      mocks.participantFindMany.mockResolvedValue(
        makeParticipants([{ userId: creatorId, inviteSource: "creator" }])
      );
      // Venue voting is open
      mocks.eventFindUnique.mockResolvedValue(makeEvent({ status: "voting", voteClosesAt: new Date(Date.now() + 3600_000) }));

      const createRes = await post("/nominations", { nominee_id: nomineeId }, signToken(creatorId));
      const nom = await createRes.json();
      expect(nom.status).toBe("approved");

      const respondRes = await post(`/nominations/${nom.id}/respond`, { accept: true }, signToken(nomineeId));
      expect(respondRes.status).toBe(200);
      const updated = await respondRes.json();
      expect(updated.status).toBe("accepted");

      // Verify added to Prisma with inviteSource = direct and voteStatus = invited
      expect(mocks.participantCreate).toHaveBeenCalledWith({
        data: {
          eventId,
          userId: nomineeId,
          voteStatus: "invited",
          inviteSource: "direct",
          sourceGroupIds: [],
        },
      });

      // Notifies nominee via socket
      expect(mocks.emitToUsers).toHaveBeenCalledWith([nomineeId], "event:created", { event_id: eventId });
    });

    it("adds the accepted invitee with confirmed voteStatus when venue voting is closed without reopening voting", async () => {
      mocks.participantFindMany.mockResolvedValue(
        makeParticipants([{ userId: creatorId, inviteSource: "creator" }])
      );
      // Venue voting is closed / event confirmed
      mocks.eventFindUnique.mockResolvedValue(
        makeEvent({ status: "confirmed", voteClosesAt: new Date(Date.now() - 3600_000) })
      );

      const createRes = await post("/nominations", { nominee_id: nomineeId }, signToken(creatorId));
      const nom = await createRes.json();

      const respondRes = await post(`/nominations/${nom.id}/respond`, { accept: true }, signToken(nomineeId));
      expect(respondRes.status).toBe(200);

      // voteStatus is confirmed when voting is already closed
      expect(mocks.participantCreate).toHaveBeenCalledWith({
        data: {
          eventId,
          userId: nomineeId,
          voteStatus: "confirmed",
          inviteSource: "direct",
          sourceGroupIds: [],
        },
      });
    });

    it("does not add nominee to participants when declined", async () => {
      mocks.participantFindMany.mockResolvedValue(
        makeParticipants([{ userId: creatorId, inviteSource: "creator" }])
      );

      const createRes = await post("/nominations", { nominee_id: nomineeId }, signToken(creatorId));
      const nom = await createRes.json();

      const respondRes = await post(`/nominations/${nom.id}/respond`, { accept: false }, signToken(nomineeId));
      expect(respondRes.status).toBe(200);
      const updated = await respondRes.json();
      expect(updated.status).toBe("declined");

      expect(mocks.participantCreate).not.toHaveBeenCalled();
    });

    it("rejects response from someone other than the nominee with 403", async () => {
      mocks.participantFindMany.mockResolvedValue(
        makeParticipants([{ userId: creatorId, inviteSource: "creator" }])
      );

      const createRes = await post("/nominations", { nominee_id: nomineeId }, signToken(creatorId));
      const nom = await createRes.json();

      const res = await post(`/nominations/${nom.id}/respond`, { accept: true }, signToken(creatorId));
      expect(res.status).toBe(403);
    });

    it("rejects response if nomination is not yet approved with 400", async () => {
      mocks.participantFindMany.mockResolvedValue(
        makeParticipants([
          { userId: creatorId, inviteSource: "creator" },
          { userId: squadMember1, inviteSource: "squad" },
        ])
      );

      const createRes = await post("/nominations", { nominee_id: nomineeId }, signToken(creatorId));
      const nom = await createRes.json();
      expect(nom.status).toBe("pending");

      const res = await post(`/nominations/${nom.id}/respond`, { accept: true }, signToken(nomineeId));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "not_approved" });
    });

    it("handles race condition if event reached capacity before acceptance", async () => {
      mocks.participantFindMany.mockResolvedValue(
        makeParticipants([{ userId: creatorId, inviteSource: "creator" }])
      );

      const createRes = await post("/nominations", { nominee_id: nomineeId }, signToken(creatorId));
      const nom = await createRes.json();

      // Later, event fills up to 6 before nominee clicks accept
      mocks.participantFindMany.mockResolvedValueOnce(
        makeParticipants([
          { userId: creatorId, inviteSource: "creator" },
          { userId: squadMember1, inviteSource: "squad" },
          { userId: squadMember2, inviteSource: "squad" },
          { userId: squadMember3, inviteSource: "squad" },
          { userId: "u5", inviteSource: "squad" },
          { userId: "u6", inviteSource: "squad" },
        ])
      );

      const res = await post(`/nominations/${nom.id}/respond`, { accept: true }, signToken(nomineeId));
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ error: "capacity_exceeded" });
      expect(mocks.participantCreate).not.toHaveBeenCalled();
    });
  });

  describe("GET /events/:id/nominations", () => {
    it("returns all nominations to squad members with chat access", async () => {
      mocks.participantFindMany.mockResolvedValue(
        makeParticipants([
          { userId: creatorId, inviteSource: "creator" },
          { userId: squadMember1, inviteSource: "squad" },
        ])
      );

      await post("/nominations", { nominee_id: nomineeId }, signToken(creatorId));

      const res = await get("/nominations", signToken(squadMember1));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.nominations).toHaveLength(1);
      expect(json.nominations[0].nominee_id).toBe(nomineeId);
    });

    it("allows nominee to view their own nomination", async () => {
      mocks.participantFindMany.mockResolvedValue(
        makeParticipants([{ userId: creatorId, inviteSource: "creator" }])
      );

      await post("/nominations", { nominee_id: nomineeId }, signToken(creatorId));

      const res = await get("/nominations", signToken(nomineeId));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.nominations).toHaveLength(1);
      expect(json.nominations[0].nominee_id).toBe(nomineeId);
    });

    it("rejects stranger with 403", async () => {
      const res = await get("/nominations", signToken(strangerId));
      expect(res.status).toBe(403);
    });
  });
});
