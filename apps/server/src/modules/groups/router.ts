// Owner: Ojas — Squads (#76): named groups joined by consent. The rules live in squads.ts.
// Non-members get 404 for everything, so squads aren't discoverable.
import { Router, type Request } from "express";
import { CreateSquadRequest, InviteToSquadRequest, RenameSquadRequest, RespondToSquadRequest, Squad, SquadsResponse, routes } from "@web/contract";
import { requireAuth, type AuthedRequest } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { publicUserSelect, toPublicUser } from "../auth/helpers";
import { pair } from "../friends/handshake";
import { hasRoom, isDue, onAccept, visibleJoinsAt } from "./squads";

export const squadsRouter = Router();

const meOf = (req: Request) => (req as AuthedRequest).userId;
const withMembers = { members: { include: { user: { select: publicUserSelect } } } } as const;
const membership = (groupId: string, userId: string) =>
  prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });

async function toSquad(groupId: string, me: string) {
  const g = await prisma.explicitGroup.findUniqueOrThrow({ where: { id: groupId }, include: withMembers });
  return Squad.parse({
    id: g.id,
    name: g.name,
    my_status: g.members.find((m) => m.userId === me)!.status,
    members: [...g.members]
      .sort((a, b) => (a.status === b.status ? a.user.username.localeCompare(b.user.username) : a.status === "active" ? -1 : 1))
      .map((m) => ({
        ...toPublicUser(m.user),
        status: m.status,
        joins_at: visibleJoinsAt(m)?.toISOString() ?? null,
      })),
  });
}

/** Invitees must be my accepted friends and not already in the squad. Returns an error code, or null if fine. */
async function inviteError(me: string, ids: string[], groupId: string | null): Promise<string | null> {
  if (new Set(ids).size !== ids.length || ids.includes(me)) return "invalid_invitees";
  const pairs = ids.map((id) => {
    const { userLowId, userHighId } = pair(me, id);
    return { userLowId, userHighId };
  });
  const friends = await prisma.friendship.count({ where: { status: "accepted", OR: pairs } });
  if (friends !== ids.length) return "not_friends";
  if (groupId && (await prisma.groupMember.count({ where: { groupId, userId: { in: ids } } }))) return "already_member";
  return null;
}

squadsRouter.get(routes.squads, requireAuth, async (req, res) => {
  const me = meOf(req);
  const groups = await prisma.explicitGroup.findMany({
    where: { members: { some: { userId: me } } },
    select: { id: true },
    orderBy: { name: "asc" },
  });
  res.json(SquadsResponse.parse({ squads: await Promise.all(groups.map((g) => toSquad(g.id, me))) }));
});

squadsRouter.post(routes.squads, requireAuth, async (req, res) => {
  const body = CreateSquadRequest.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "invalid_body", message: body.error.message });
  const me = meOf(req);
  const error = await inviteError(me, body.data.invitee_ids, null);
  if (error) return res.status(409).json({ error });
  const now = new Date();
  const group = await prisma.explicitGroup.create({
    data: {
      name: body.data.name,
      createdBy: me,
      members: {
        create: [
          { userId: me, status: "active" },
          ...body.data.invitee_ids.map((userId) => ({ userId, status: "invited" as const, invitedById: me, invitedAt: now })),
        ],
      },
    },
  });
  res.status(201).json(await toSquad(group.id, me));
});

squadsRouter.post(routes.squadInvite(":id"), requireAuth, async (req, res) => {
  const body = InviteToSquadRequest.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "invalid_body", message: body.error.message });
  const me = meOf(req);
  const groupId = String(req.params.id);
  if ((await membership(groupId, me))?.status !== "active") return res.status(404).json({ error: "not_found" });
  const error = await inviteError(me, body.data.invitee_ids, groupId);
  if (error) return res.status(409).json({ error });
  if (!hasRoom(await prisma.groupMember.count({ where: { groupId } }), body.data.invitee_ids.length)) {
    return res.status(409).json({ error: "squad_full" });
  }
  const now = new Date();
  await prisma.groupMember.createMany({
    data: body.data.invitee_ids.map((userId) => ({ groupId, userId, status: "invited" as const, invitedById: me, invitedAt: now })),
  });
  res.status(204).end();
});

// An active member objects to a pending invite: it's removed, quietly.
squadsRouter.delete(routes.squadInvitee(":id", ":userId"), requireAuth, async (req, res) => {
  const groupId = String(req.params.id);
  if ((await membership(groupId, meOf(req)))?.status !== "active") return res.status(404).json({ error: "not_found" });
  const invite = await membership(groupId, String(req.params.userId));
  if (invite?.status !== "invited") return res.status(404).json({ error: "not_found" });
  await prisma.groupMember.delete({ where: { id: invite.id } });
  res.status(204).end();
});

squadsRouter.post(routes.squadRespond(":id"), requireAuth, async (req, res) => {
  const body = RespondToSquadRequest.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "invalid_body", message: body.error.message });
  const groupId = String(req.params.id);
  const mine = await membership(groupId, meOf(req));
  if (mine?.status !== "invited" || mine.acceptedAt) return res.status(404).json({ error: "not_found" });
  if (!body.data.accept) {
    await prisma.groupMember.delete({ where: { id: mine.id } });
    return res.status(204).end();
  }
  const now = new Date();
  await prisma.groupMember.update({ where: { id: mine.id }, data: { status: "active", acceptedAt: now } });
  res.status(204).end();


});

squadsRouter.post(routes.squadLeave(":id"), requireAuth, async (req, res) => {
  const groupId = String(req.params.id);
  const mine = await membership(groupId, meOf(req));
  if (!mine) return res.status(404).json({ error: "not_found" });
  await prisma.groupMember.delete({ where: { id: mine.id } });
  // The last active member out closes the squad (pending invites go with it; events keep running, sourceGroupId → null).
  if (!(await prisma.groupMember.count({ where: { groupId, status: "active" } }))) {
    await prisma.explicitGroup.delete({ where: { id: groupId } });
  }
  res.status(204).end();
});

squadsRouter.patch(routes.squad(":id"), requireAuth, async (req, res) => {
  const body = RenameSquadRequest.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "invalid_body", message: body.error.message });
  const groupId = String(req.params.id);
  if ((await membership(groupId, meOf(req)))?.status !== "active") return res.status(404).json({ error: "not_found" });
  await prisma.explicitGroup.update({ where: { id: groupId }, data: { name: body.data.name } });
  res.status(204).end();
});

/** Activate accepted invites whose objection window has passed. Runs on an interval (index.ts). */
export async function promoteDueInvites(now = new Date()): Promise<number> {
  const waiting = await prisma.groupMember.findMany({ where: { status: "invited", acceptedAt: { not: null } } });
  const due = waiting.filter((m) => isDue(m, now)).map((m) => m.id);
  if (!due.length) return 0;
  const { count } = await prisma.groupMember.updateMany({ where: { id: { in: due }, status: "invited" }, data: { status: "active" } });
  return count;
}
