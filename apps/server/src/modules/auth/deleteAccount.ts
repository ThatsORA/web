import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../../lib/prisma";

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Cleanly deletes a user account and all dependent records across MongoDB Atlas collections.
 * Enforces cascades and referential integrity before the User document is removed,
 * ensuring other users' GET /events, GET /squads, and GET /friends do not fail with Prisma 500s.
 */
export async function deleteAccount(userId: string, db: DbClient = prisma): Promise<void> {
  const runCleanup = async (tx: Prisma.TransactionClient) => {
    // 1. Groups and squad memberships
    const userGroups = await tx.groupMember.findMany({
      where: { userId },
      select: { groupId: true },
    });
    const groupIds = userGroups.map((g) => g.groupId);

    // Remove user from all squads
    await tx.groupMember.deleteMany({ where: { userId } });

    // Clear invitedById if the user invited others
    await tx.groupMember.updateMany({
      where: { invitedById: userId },
      data: { invitedById: null },
    });

    // Check squads the user created
    const createdGroups = await tx.explicitGroup.findMany({
      where: { createdBy: userId },
      select: { id: true },
    });

    for (const group of createdGroups) {
      const nextLeader = await tx.groupMember.findFirst({
        where: { groupId: group.id, status: "active" },
        orderBy: { invitedAt: "asc" },
      });
      if (nextLeader) {
        await tx.explicitGroup.update({
          where: { id: group.id },
          data: { createdBy: nextLeader.userId },
        });
      } else {
        // No active members remain: detach events and delete the squad
        await tx.event.updateMany({
          where: { sourceGroupId: group.id },
          data: { sourceGroupId: null },
        });
        await tx.groupMember.deleteMany({ where: { groupId: group.id } });
        await tx.explicitGroup.delete({ where: { id: group.id } });
      }
    }

    // Also close any squads from groupIds that now have 0 active members
    for (const groupId of groupIds) {
      const activeCount = await tx.groupMember.count({
        where: { groupId, status: "active" },
      });
      if (activeCount === 0) {
        await tx.event.updateMany({
          where: { sourceGroupId: groupId },
          data: { sourceGroupId: null },
        });
        await tx.groupMember.deleteMany({ where: { groupId } });
        await tx.explicitGroup.deleteMany({ where: { id: groupId } });
      }
    }

    // 2. Hangouts / Events
    // Remove participant record
    await tx.eventParticipant.deleteMany({ where: { userId } });

    // Detach creator on any events created by this user
    await tx.event.updateMany({
      where: { createdById: userId },
      data: { createdById: null },
    });

    // Votes
    await tx.vote.deleteMany({ where: { userId } });

    // Chat messages
    await tx.chatMessage.deleteMany({ where: { userId } });

    // Nominations
    await tx.eventNomination.deleteMany({
      where: { OR: [{ nomineeId: userId }, { nominatedById: userId }] },
    });

    // 3. Friendships (both sides of the pair)
    await tx.friendship.deleteMany({
      where: { OR: [{ userLowId: userId }, { userHighId: userId }] },
    });

    // 4. Favorites
    await tx.userFavorite.deleteMany({ where: { userId } });

    // 5. Busy blocks and calendar connections
    await tx.busyBlock.deleteMany({ where: { userId } });
    await tx.googleCalendarConnection.deleteMany({ where: { userId } });

    // 6. Push tokens and email codes
    await tx.pushToken.deleteMany({ where: { userId } });
    await tx.emailCode.deleteMany({ where: { userId } });

    // 7. Expenses and splits
    const userExpenses = await tx.expense.findMany({
      where: { paidBy: userId },
      select: { id: true },
    });
    if (userExpenses.length > 0) {
      const expenseIds = userExpenses.map((e) => e.id);
      await tx.expenseSplit.deleteMany({ where: { expenseId: { in: expenseIds } } });
      await tx.expense.deleteMany({ where: { id: { in: expenseIds } } });
    }
    await tx.expenseSplit.deleteMany({ where: { userId } });

    // 8. Finally, delete the user record itself
    await tx.user.delete({ where: { id: userId } });
  };

  if ("$transaction" in db) {
    await db.$transaction(runCleanup);
  } else {
    await runCleanup(db as Prisma.TransactionClient);
  }
}
