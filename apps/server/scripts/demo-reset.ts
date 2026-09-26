// Owner: Andy — wipe events, the presenter account and its friendship edges,
// then re-run the seed. Run before every rehearsal:
//   pnpm --filter @web/server demo:reset
// "Presenter" = every user the seed doesn't own (phone A's fresh signup).
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { DEMO_USERS } from "./demoSeed";

const prisma = new PrismaClient();
const seededUsernames = DEMO_USERS.map((user) => user.username);

async function reset() {
  const presenters = await prisma.user.findMany({
    where: { username: { notIn: seededUsernames } },
    select: { id: true, username: true },
  });
  const presenterIds = presenters.map((user) => user.id);
  const presenterGroups = await prisma.explicitGroup.findMany({
    where: { createdBy: { in: presenterIds } },
    select: { id: true },
  });
  const presenterGroupIds = presenterGroups.map((group) => group.id);

  // MongoDB has no FK cascades, so delete children before parents, all at once.
  const [splits, expenses, votes, options, participants, events, members, groups, friendships, busyBlocks, favorites, calendars, users] =
    await prisma.$transaction([
      prisma.expenseSplit.deleteMany({}),
      prisma.expense.deleteMany({}),
      prisma.vote.deleteMany({}),
      prisma.eventOption.deleteMany({}),
      prisma.eventParticipant.deleteMany({}),
      prisma.event.deleteMany({}),
      prisma.groupMember.deleteMany({
        where: { OR: [{ userId: { in: presenterIds } }, { groupId: { in: presenterGroupIds } }] },
      }),
      prisma.explicitGroup.deleteMany({ where: { id: { in: presenterGroupIds } } }),
      prisma.friendship.deleteMany({
        where: { OR: [{ userLowId: { in: presenterIds } }, { userHighId: { in: presenterIds } }] },
      }),
      prisma.busyBlock.deleteMany({ where: { userId: { in: presenterIds } } }),
      prisma.userFavorite.deleteMany({ where: { userId: { in: presenterIds } } }),
      prisma.googleCalendarConnection.deleteMany({ where: { userId: { in: presenterIds } } }),
      prisma.user.deleteMany({ where: { id: { in: presenterIds } } }),
    ]);

  console.log(
    `Deleted ${events.count} events (${participants.count} participants, ${options.count} options, ${votes.count} votes, ${expenses.count} expenses, ${splits.count} splits).`,
  );
  console.log(
    `Deleted ${users.count} presenter account(s) [${presenters.map((user) => user.username).join(", ") || "none"}] with ${friendships.count} friendships, ${busyBlocks.count} busy blocks, ${favorites.count} favorites, ${groups.count} groups, ${members.count} group memberships, ${calendars.count} calendar connections.`,
  );

  // seed.ts runs itself on import and exports nothing, so run it as its own process.
  execSync("pnpm db:seed", { stdio: "inherit" });
}

reset()
  .catch((error: unknown) => {
    console.error("Demo reset failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
