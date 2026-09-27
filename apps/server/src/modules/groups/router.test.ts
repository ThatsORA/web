import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Users A–G are all friends with each other; X is nobody's friend.
const uid = (n: number) => `${n}`.repeat(8) + "-1111-4111-8111-111111111111";
const [A, B, C, D, E, F, G, X] = [1, 2, 3, 4, 5, 6, 7, 8].map(uid) as [string, string, string, string, string, string, string, string];
const ids: Record<string, string> = { A, B, C, D, E, F, G, X };
type Member = { id: string; groupId: string; userId: string; status: "invited" | "active"; invitedById?: string; invitedAt?: Date | null; acceptedAt?: Date | null };
const db = vi.hoisted(() => ({ groups: [] as { id: string; name: string; createdBy: string }[], members: [] as Record<string, any>[] }));
const username = (id: string) => Object.keys(ids).find((k) => ids[k] === id)!.toLowerCase();
const memberWhere = (m: Member, w: Record<string, any>) =>
  (w.groupId === undefined || m.groupId === w.groupId) &&
  (w.status === undefined || m.status === w.status) &&
  (w.userId === undefined || w.userId.in.includes(m.userId)) &&
  (w.id === undefined || w.id.in.includes(m.id));
vi.mock("../../lib/prisma", () => ({
  prisma: {
    user: { findUnique: async () => ({ passwordChangedAt: null }) },
    friendship: {
      count: async ({ where }: { where: { OR: { userLowId: string; userHighId: string }[] } }) =>
        where.OR.filter((p) => p.userLowId !== X && p.userHighId !== X).length,
    },
    groupMember: {
      findUnique: async ({ where: { groupId_userId: k } }: any) => db.members.find((m) => m.groupId === k.groupId && m.userId === k.userId) ?? null,
      count: async ({ where }: any) => db.members.filter((m) => memberWhere(m as Member, where)).length,
      createMany: async ({ data }: any) => void db.members.push(...data.map((d: any) => ({ id: randomUUID(), acceptedAt: null, ...d }))),
      delete: async ({ where }: any) => db.members.splice(db.members.findIndex((m) => m.id === where.id), 1),
      update: async ({ where, data }: any) => Object.assign(db.members.find((m) => m.id === where.id)!, data),
      findMany: async ({ where }: any) => db.members.filter((m) => m.status === where.status && m.acceptedAt != null),
      updateMany: async ({ where, data }: any) => {
        const hit = db.members.filter((m) => memberWhere(m as Member, where));
        hit.forEach((m) => Object.assign(m, data));
        return { count: hit.length };
      },
    },
    explicitGroup: {
      create: async ({ data }: any) => {
        const g = { id: randomUUID(), name: data.name, createdBy: data.createdBy };
        db.groups.push(g);
        db.members.push(...data.members.create.map((m: any) => ({ id: randomUUID(), groupId: g.id, acceptedAt: null, invitedAt: null, ...m })));
        return g;
      },
      findMany: async ({ where }: any) =>
        db.groups.filter((g) => db.members.some((m) => m.groupId === g.id && m.userId === where.members.some.userId)).map((g) => ({ id: g.id })),
      findUniqueOrThrow: async ({ where }: any) => ({
        ...db.groups.find((g) => g.id === where.id)!,
        members: db.members.filter((m) => m.groupId === where.id).map((m) => ({ ...m, user: { id: m.userId, username: username(m.userId), displayName: null } })),
      }),
      update: async ({ where, data }: any) => Object.assign(db.groups.find((g) => g.id === where.id)!, data),
      delete: async ({ where }: any) => {
        db.groups = db.groups.filter((g) => g.id !== where.id);
        db.members = db.members.filter((m) => m.groupId !== where.id);
      },
    },
  },
}));
import { promoteDueInvites, squadsRouter } from "./router";
import { signToken } from "../../lib/auth";
import { OBJECTION_WINDOW_MS } from "./squads";

let base: string;
let close: () => void;
beforeAll(async () => {
  const app = express();
  app.use(express.json(), squadsRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => close());
beforeEach(() => {
  db.groups = [];
  db.members = [];
});
const as = (userId: string, path: string, init: { method?: string; body?: unknown } = {}) =>
  fetch(base + path, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", authorization: `Bearer ${signToken(userId)}` },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
const create = async (by: string, invitees: string[]) =>
  (await as(by, "/squads", { method: "POST", body: { name: "Roommates", invitee_ids: invitees } })).json();
const accept = (who: string, id: string) => as(who, `/squads/${id}/respond`, { method: "POST", body: { accept: true } });
const statusOf = (userId: string) => db.members.find((m) => m.userId === userId)?.status;

describe("squads", () => {
  it("create: I'm active, invitees are invited; only friends can be invited", async () => {
    const squad = await create(A, [B, C]);
    expect(squad).toMatchObject({ name: "Roommates", my_status: "active" });
    expect(squad.members.map((m: { status: string }) => m.status)).toEqual(["active", "invited", "invited"]);
    expect((await (await as(B, "/squads")).json()).squads[0]).toMatchObject({ my_status: "invited" });
    expect((await as(A, "/squads", { method: "POST", body: { name: "x", invitee_ids: [X] } })).status).toBe(409);
    expect((await as(A, "/squads", { method: "POST", body: { name: " ", invitee_ids: [B] } })).status).toBe(400);
  });

  it("small squad: accepting joins straight away; declining removes the invite", async () => {
    const { id } = await create(A, [B, C]);
    expect((await accept(B, id)).status).toBe(204);
    expect(statusOf(B)).toBe("active");
    await as(C, `/squads/${id}/respond`, { method: "POST", body: { accept: false } });
    expect(statusOf(C)).toBeUndefined();
  });

  it("accepting an invite joins straight away; active members can invite and remove pending invites", async () => {
    const { id } = await create(A, [B, C]);
    await accept(B, id);
    await accept(C, id);
    await as(B, `/squads/${id}/invite`, { method: "POST", body: { invitee_ids: [D, E] } });
    await accept(D, id);
    expect(statusOf(D)).toBe("active");
    const squad = (await (await as(A, "/squads")).json()).squads[0];
    expect(squad.members.find((m: { id: string }) => m.id === D).status).toBe("active");

    expect((await as(C, `/squads/${id}/invites/${E}`, { method: "DELETE" })).status).toBe(204); // C objects to pending invite E
    expect(statusOf(E)).toBeUndefined();
  });


  it("only active members invite, object or rename; outsiders get 404", async () => {
    const { id } = await create(A, [B]);
    expect((await as(B, `/squads/${id}/invite`, { method: "POST", body: { invitee_ids: [C] } })).status).toBe(404);
    expect((await as(C, `/squads/${id}`, { method: "PATCH", body: { name: "Mine" } })).status).toBe(404);
    expect((await accept(C, id)).status).toBe(404);
    expect((await as(A, `/squads/${id}`, { method: "PATCH", body: { name: "Flat 4B" } })).status).toBe(204);
    expect(db.groups[0]!.name).toBe("Flat 4B");
  });

  it("caps at 6 people and refuses duplicate invites", async () => {
    const { id } = await create(A, [B, C, D, E, F]);
    expect((await (await as(A, `/squads/${id}/invite`, { method: "POST", body: { invitee_ids: [G] } })).json())).toEqual({ error: "squad_full" });
    await as(A, `/squads/${id}/leave`, { method: "POST" });
    expect(db.groups).toHaveLength(0); // last active member out closes the squad
    const again = await create(A, [B]);
    expect((await (await as(A, `/squads/${again.id}/invite`, { method: "POST", body: { invitee_ids: [B] } })).json())).toEqual({ error: "already_member" });
  });
});
