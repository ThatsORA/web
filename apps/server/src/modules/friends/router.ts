// Owner: Ojas — username search, friend requests (visible to both) and close friends (silent).
// Never reveal whether the other person marked you close (invariants.md Privacy).
import { Router, type Request, type Response } from "express";
import { AddCloseFriendRequest, SendFriendRequest, routes } from "@web/contract";
import { requireAuth, type AuthedRequest } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { emitToUsers } from "../../realtime";
import { isUniqueViolation } from "../auth/helpers";
import { triggerMatcher } from "../matching/matcher";
import { isMutual, pair } from "./handshake";
import { MAX_PENDING_OUTGOING, canAccept, onDelete, onSend, requestView } from "./requests";

export const friendsRouter = Router();
friendsRouter.use(requireAuth);

const meOf = (req: Request) => (req as AuthedRequest).userId;
const withUsers = { userLow: { select: { id: true, username: true } }, userHigh: { select: { id: true, username: true } } };
const mine = (me: string) => ({ OR: [{ userLowId: me }, { userHighId: me }] });
type Pair<U> = { userLowId: string; userLow: U; userHigh: U };
const otherOf = <U>(row: Pair<U>, me: string) => (row.userLowId === me ? row.userHigh : row.userLow);

/** Resolve `{ username }` to the other user, or send the 400/404 and return null. */
async function target(req: Request, res: Response, schema: typeof SendFriendRequest) {
  const body = schema.safeParse(req.body);
  const other = body.success
    ? await prisma.user.findUnique({ where: { username: body.data.username.toLowerCase() }, select: { id: true } })
    : null;
  if (!body.success) res.status(400).json({ error: "invalid_body", message: body.error.message });
  else if (!other) res.status(404).json({ error: "not_found" });
  else if (other.id === meOf(req)) res.status(400).json({ error: "cannot_add_self" });
  else return other;
  return null;
}

friendsRouter.get(routes.userSearch, async (req, res) => {
  const me = meOf(req);
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

// ---------- friends (visible layer) ----------

friendsRouter.post(routes.friendRequests, async (req, res) => {
  const other = await target(req, res, SendFriendRequest);
  if (!other) return;
  const me = meOf(req);
  const { userLowId, userHighId } = pair(me, other.id);
  const key = { userLowId_userHighId: { userLowId, userHighId } };
  const action = onSend(await prisma.friendship.findUnique({ where: key }), me);

  if (action === "requested" || action === "friends") return res.json({ status: action });
  if (action === "accept") {
    await prisma.friendship.update({ where: key, data: { status: "accepted", acceptedAt: new Date(), declinedAt: null } });
    emitToUsers([other.id], "friend:accepted", { user_id: me });
    return res.json({ status: "friends" });
  }
  const outgoing = await prisma.friendship.count({ where: { status: "pending", requestedById: me } });
  if (outgoing >= MAX_PENDING_OUTGOING) return res.status(429).json({ error: "too_many_requests" });
  try {
    await prisma.friendship.create({ data: { userLowId, userHighId, status: "pending", requestedById: me } });
  } catch (err) {
    // A double tap raced us; the first request stands.
    if (isUniqueViolation(err)) return res.json({ status: "requested" });
    throw err;
  }
  emitToUsers([other.id], "friend:request", { user_id: me });
  res.json({ status: "requested" });
});

friendsRouter.get(routes.friendRequests, async (req, res) => {
  const me = meOf(req);
  const rows = await prisma.friendship.findMany({
    where: { status: "pending", ...mine(me) },
    include: withUsers,
    orderBy: { requestedAt: "desc" },
  });
  const out = { incoming: [] as unknown[], outgoing: [] as unknown[] };
  for (const r of rows) {
    const view = requestView(r, me);
    if (view) out[view].push({ id: r.id, user: otherOf(r, me), requested_at: r.requestedAt.toISOString() });
  }
  res.json(out);
});

friendsRouter.post(routes.acceptFriendRequest(":id"), async (req, res) => {
  const me = meOf(req);
  const row = await prisma.friendship.findFirst({ where: { id: String(req.params.id), ...mine(me) } });
  if (!row || !canAccept(row, me)) return res.status(404).json({ error: "not_found" });
  await prisma.friendship.update({ where: { id: row.id }, data: { status: "accepted", acceptedAt: new Date(), declinedAt: null } });
  if (row.requestedById) emitToUsers([row.requestedById], "friend:accepted", { user_id: me });
  res.status(204).end();
});

// Decline or cancel. Both are silent: no socket event, and a decline isn't visible to the requester.
friendsRouter.delete(routes.friendRequest(":id"), async (req, res) => {
  const me = meOf(req);
  const row = await prisma.friendship.findFirst({ where: { id: String(req.params.id), status: "pending", ...mine(me) } });
  if (!row) return res.status(404).json({ error: "not_found" });
  if (onDelete(row, me) === "cancel") await prisma.friendship.delete({ where: { id: row.id } });
  else await prisma.friendship.update({ where: { id: row.id }, data: { declinedAt: new Date() } });
  res.status(204).end();
});

friendsRouter.get(routes.friends, async (req, res) => {
  const me = meOf(req);
  const rows = await prisma.friendship.findMany({ where: { status: "accepted", ...mine(me) }, include: withUsers });
  const friends = rows
    .map((r) => ({ ...otherOf(r, me), close: r.userLowId === me ? r.lowAddedHigh : r.highAddedLow }))
    .sort((a, b) => a.username.localeCompare(b.username));
  res.json({ friends });
});

// Unfriend: deleting the row clears both close-friend flags with it. Open events are left alone.
friendsRouter.delete(routes.friend(":userId"), async (req, res) => {
  const { userLowId, userHighId } = pair(meOf(req), String(req.params.userId));
  await prisma.friendship.deleteMany({ where: { userLowId, userHighId, status: "accepted" } });
  res.status(204).end();
});

// ---------- close friends (silent layer, accepted friends only) ----------

// My choices only; never whether they chose me back.
friendsRouter.get(routes.closeFriends, async (req, res) => {
  const me = meOf(req);
  const rows = await prisma.friendship.findMany({
    where: { status: "accepted", OR: [{ userLowId: me, lowAddedHigh: true }, { userHighId: me, highAddedLow: true }] },
    include: withUsers,
  });
  res.json({ friends: rows.map((r) => otherOf(r, me)) });
});

// 204 either way: the adder never learns whether they were added back.
friendsRouter.post(routes.closeFriends, async (req, res) => {
  const other = await target(req, res, AddCloseFriendRequest);
  if (!other) return;
  const { userLowId, userHighId, myFlag } = pair(meOf(req), other.id);
  const key = { userLowId_userHighId: { userLowId, userHighId } };
  const existing = await prisma.friendship.findUnique({ where: key });
  if (existing?.status !== "accepted") return res.status(409).json({ error: "not_friends" });
  if (existing[myFlag]) return res.status(204).end();

  const row = await prisma.friendship.update({ where: key, data: { [myFlag]: true } });
  // ponytail: reruns the whole matcher, not just groups containing this pair; it's mutexed and deduped.
  if (isMutual(row)) void triggerMatcher().catch((e: unknown) => console.error("triggerMatcher", e));
  res.status(204).end();
});

friendsRouter.delete(routes.closeFriend(":userId"), async (req, res) => {
  const { userLowId, userHighId, myFlag } = pair(meOf(req), String(req.params.userId));
  const key = { userLowId_userHighId: { userLowId, userHighId } };
  const existing = await prisma.friendship.findUnique({ where: key });
  if (existing?.status !== "accepted") return res.status(409).json({ error: "not_friends" });
  await prisma.friendship.update({ where: key, data: { [myFlag]: false } });
  res.status(204).end();
});
