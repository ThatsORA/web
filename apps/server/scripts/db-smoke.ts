// Owner: Ojas — Atlas smoke check (issue #1). Run after db:push:
//   pnpm --filter @web/server db:smoke
// Creates 2 users + a friendship, reads them back, then deletes them.
import { prisma } from "../src/lib/prisma";

const tag = `smoke_${Date.now()}`;

function createUser(suffix: string) {
  return prisma.user.create({
    data: {
      username: `${tag}_${suffix}`,
      email: `${tag}_${suffix}@example.com`,
      passwordHash: "x",
      timezone: "America/New_York",
    },
  });
}

async function main() {
  const a = await createUser("a");
  const b = await createUser("b");
  // Invariant: userLowId < userHighId.
  const [low, high] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
  try {
    await prisma.friendship.create({
      data: { userLowId: low, userHighId: high, lowAddedHigh: true, highAddedLow: true },
    });
    const back = await prisma.friendship.findUnique({
      where: { userLowId_userHighId: { userLowId: low, userHighId: high } },
      include: { userLow: true, userHigh: true },
    });
    if (!back || back.userLow.id !== low || back.userHigh.id !== high) {
      throw new Error("friendship did not read back");
    }
    // The unique pair index must reject a duplicate.
    const dupAccepted = await prisma.friendship
      .create({ data: { userLowId: low, userHighId: high } })
      .then(
        () => true,
        () => false,
      );
    if (dupAccepted) throw new Error("duplicate friendship accepted: run db:push to create indexes");
    console.log(`ok: ${back.userLow.username} <-> ${back.userHigh.username}, mutual`);
  } finally {
    await prisma.friendship.deleteMany({ where: { userLowId: low } });
    await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
