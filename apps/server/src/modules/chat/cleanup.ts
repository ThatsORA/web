import { prisma } from "../../lib/prisma";

/**
 * Deletes chat messages for events whose endsAt is older than 7 days.
 * Acceptance criteria: Messages deleted 7 days after ends_at (a cleanup cron).
 */
export async function cleanupChatMessages(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oldEvents = await prisma.event.findMany({
    where: { endsAt: { lte: cutoff } },
    select: { id: true },
  });
  if (oldEvents.length === 0) return 0;

  const result = await prisma.chatMessage.deleteMany({
    where: { eventId: { in: oldEvents.map((e) => e.id) } },
  });
  return result.count;
}
