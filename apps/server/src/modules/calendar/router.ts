// Owner: Riley — replace the caller's busy blocks inside a half-open horizon.
import { Router } from "express";
import { PutBusyBlocksRequest, PutBusyBlocksResponse, routes } from "@web/contract";
import { requireAuth, type AuthedRequest } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { triggerMatcher } from "../matching/matcher";

export const calendarRouter = Router();
calendarRouter.put(routes.busyBlocks, requireAuth, async (req, res) => {
  const parsed = PutBusyBlocksRequest.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_busy_blocks" });
  const { horizon_start, horizon_end, blocks } = parsed.data;
  const start = new Date(horizon_start);
  const end = new Date(horizon_end);
  if (start >= end || blocks.some(block => {
    const s = new Date(block.starts_at), e = new Date(block.ends_at);
    return s >= e || s < start || e > end;
  })) return res.status(400).json({ error: "invalid_busy_blocks" });
  const userId = (req as AuthedRequest).userId;
  const unique = [...new Map(blocks.map(block => {
    const startsAt = new Date(block.starts_at), endsAt = new Date(block.ends_at);
    return [`${startsAt.toISOString()}/${endsAt.toISOString()}`, { startsAt, endsAt }];
  })).values()];
  await prisma.$transaction(async tx => {
    const where = { userId, startsAt: { lt: end }, endsAt: { gt: start } };
    const existing = await tx.busyBlock.findMany({ where });
    await tx.busyBlock.deleteMany({ where });
    // Preserve portions outside the replaced horizon, including seeded blocks.
    const tails = existing.flatMap(block => {
      const base = { userId, source: block.source, syncedAt: block.syncedAt };
      return [
        ...(block.startsAt < start ? [{ ...base, startsAt: block.startsAt, endsAt: start }] : []),
        ...(block.endsAt > end ? [{ ...base, startsAt: end, endsAt: block.endsAt }] : []),
      ];
    });
    const data = [...tails, ...unique.map(block => ({ ...block, userId, source: "device_calendar" as const }))];
    if (data.length) await tx.busyBlock.createMany({ data });
  });
  // The sync has committed. Matcher failure must not turn a successful upload into an error.
  void triggerMatcher().catch(() => console.error("Matcher failed after busy-block sync"));
  return res.json(PutBusyBlocksResponse.parse({ stored: unique.length }));
});
