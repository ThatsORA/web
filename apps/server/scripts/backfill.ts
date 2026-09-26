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
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
