// Owner: Ojas — username search + close-friend handshake.
// Never reveal whether the other person added you.
import { Router } from "express";
import { AddCloseFriendRequest, routes } from "@web/contract";
import { requireAuth, type AuthedRequest } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { triggerMatcher } from "../matching/matcher";
import { isMutual, pair } from "./handshake";

export const friendsRouter = Router();
friendsRouter.use(requireAuth);

friendsRouter.get(routes.userSearch, async (req, res) => {
  const me = (req as AuthedRequest).userId;
  const q = String(req.query.q ?? "").trim().toLowerCase();
  const users = q
    ? await prisma.user.findMany({
        where: { username: { startsWith: q }, id: { not: me } },
        select: { id: true, username: true },
        orderBy: { username: "asc" },
        take: 10,
      })
    : [];
  res.json({ users });
});

// My additions only. `mutual` is fine to show: both sides already chose each other.
friendsRouter.get(routes.closeFriends, async (req, res) => {
  const me = (req as AuthedRequest).userId;
  const rows = await prisma.friendship.findMany({
    where: { OR: [{ userLowId: me, lowAddedHigh: true }, { userHighId: me, highAddedLow: true }] },
    include: { userLow: { select: { id: true, username: true } }, userHigh: { select: { id: true, username: true } } },
  });
  const friends = rows.map((r) => {
    const other = r.userLowId === me ? r.userHigh : r.userLow;
    return { id: other.id, username: other.username, mutual: isMutual(r) };
  });
  res.json({ friends });
});

// 204 either way: the adder never learns whether they were added back.
friendsRouter.post(routes.closeFriends, async (req, res) => {
  const body = AddCloseFriendRequest.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "invalid_body", message: body.error.message });
  const me = (req as AuthedRequest).userId;
  const other = await prisma.user.findUnique({ where: { username: body.data.username.toLowerCase() }, select: { id: true } });
  if (!other) return res.status(404).json({ error: "not_found" });
  if (other.id === me) return res.status(400).json({ error: "cannot_add_self" });

  const { userLowId, userHighId, myFlag } = pair(me, other.id);
  const key = { userLowId_userHighId: { userLowId, userHighId } };
  const existing = await prisma.friendship.findUnique({ where: key });
  if (existing?.[myFlag]) return res.status(204).end();

  const row = await prisma.friendship.upsert({
    where: key,
    create: { userLowId, userHighId, [myFlag]: true },
    update: { [myFlag]: true },
  });
  // ponytail: reruns the whole matcher, not just groups containing this pair; it's mutexed and deduped.
  if (isMutual(row)) void triggerMatcher().catch((e: unknown) => console.error("triggerMatcher", e));
  res.status(204).end();
});

friendsRouter.delete(routes.closeFriend(":userId"), async (req, res) => {
  const me = (req as AuthedRequest).userId;
  const { userLowId, userHighId, myFlag } = pair(me, String(req.params.userId));
  await prisma.friendship.updateMany({ where: { userLowId, userHighId }, data: { [myFlag]: false } });
  res.status(204).end();
});
