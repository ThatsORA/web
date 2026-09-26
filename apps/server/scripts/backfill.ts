// Owner: Ojas — fills new required fields on documents that predate them. Prisma's @default only
// applies on create, and reading a document that lacks a required field throws, so this runs on every
// deploy right after `prisma db push` (package.json "start"). Idempotent: it only touches missing fields.
//   pnpm --filter @web/server db:backfill
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
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
