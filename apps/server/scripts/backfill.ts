// Owner: Ojas — fills new required fields on documents that predate them. Prisma's @default only
// applies on create, and reading a document that lacks a required field throws, so this runs on every
// deploy right after `prisma db push` (package.json "start"). Idempotent: it only touches missing fields.
//   pnpm --filter @web/server db:backfill
import type { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

async function main() {
  // #93: every friendship from before friend requests counts as an accepted friend.
  const res = await prisma.$runCommandRaw({
    update: "friendships",
    updates: [{ q: { status: { $exists: false } }, u: [{ $set: { status: "accepted", requested_at: "$$NOW" } }], multi: true }],
  });
  console.log("backfill friendships:", JSON.stringify(res));

  // #91: accounts made outside sign-up (seed, pre-verification users) count as verified. Sign-up writes an
  // explicit null, so this never verifies a real new account. Run after db:seed to verify seeded users.
  const users = await prisma.$runCommandRaw({
    update: "users",
    updates: [
      {
        q: { email_verified_at: { $exists: false } },
        u: [{ $set: { email_verified_at: { $ifNull: ["$created_at", "$$NOW"] } } }],
        multi: true,
      },
    ],
  });
  console.log("backfill users:", JSON.stringify(users));

  // #76: group members from before squads (seed data) are active.
  const members = await prisma.$runCommandRaw({
    update: "group_members",
    updates: [{ q: { status: { $exists: false } }, u: { $set: { status: "active" } }, multi: true }],
  });
  console.log("backfill group_members:", JSON.stringify(members));

  // #206: participants from before invite sources. A squad event's (source_group_id) members → squad;
  // the human creator → creator; everyone else → direct, including automated close-friend proposals,
  // which have no human creator view (plan Decisions Log). Updates run in order, so the catch-all is last.
  const missing = { invite_source: { $exists: false } };
  const pending = (await prisma.$runCommandRaw({ distinct: "event_participants", key: "event_id", query: missing })) as { values?: string[] };
  const events = await prisma.event.findMany({
    where: { id: { in: pending.values ?? [] } },
    select: { id: true, sourceGroupId: true, createdById: true },
  });
  const updates: Prisma.InputJsonObject[] = [];
  for (const e of events) {
    if (e.sourceGroupId) updates.push({ q: { event_id: e.id, ...missing }, u: { $set: { invite_source: "squad", squad_ids: [e.sourceGroupId] } }, multi: true });
    else if (e.createdById) updates.push({ q: { event_id: e.id, user_id: e.createdById, ...missing }, u: { $set: { invite_source: "creator", squad_ids: [] } }, multi: true });
  }
  updates.push({ q: missing, u: { $set: { invite_source: "direct", squad_ids: [] } }, multi: true });
  const participants = await prisma.$runCommandRaw({ update: "event_participants", updates });
  console.log("backfill event_participants:", JSON.stringify(participants));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
