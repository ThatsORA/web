// Owner: Riley — demo seed (plan "Demo Operations" + "Demo geography").
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  buildDemoSeedSchedule,
  DEMO_PASSWORD,
  DEMO_TIMEZONE,
  DEMO_USERS,
} from "./demoSeed";

const prisma = new PrismaClient();

async function seed() {
  const now = new Date();
  const schedule = buildDemoSeedSchedule(now);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const seededUsers = await prisma.$transaction(async (tx) => {
    const users = [];
    for (const demoUser of DEMO_USERS) {
      const user = await tx.user.upsert({
        where: { username: demoUser.username },
        update: {
          email: demoUser.email,
          emailVerifiedAt: new Date(),
          passwordHash,
          timezone: DEMO_TIMEZONE,
          homeLat: demoUser.homeLat,
          homeLng: demoUser.homeLng,
          travelMode: "DRIVE",
          prefActivities: demoUser.prefActivities,
          prefPersonality: demoUser.prefPersonality,
        },
        create: {
          username: demoUser.username,
          email: demoUser.email,
          emailVerifiedAt: new Date(),
          passwordHash,
          timezone: DEMO_TIMEZONE,
          homeLat: demoUser.homeLat,
          homeLng: demoUser.homeLng,
          travelMode: "DRIVE",
          prefActivities: demoUser.prefActivities,
          prefPersonality: demoUser.prefPersonality,
        },
      });
      users.push(user);
    }

    const [userLowId, userHighId] = users.map((user) => user.id).sort();
    await tx.friendship.upsert({
      where: { userLowId_userHighId: { userLowId: userLowId!, userHighId: userHighId! } },
      update: {
        lowAddedHigh: true,
        highAddedLow: true,
        interactionScore: 0.8,
        lastHangoutAt: schedule.lastHangoutAt,
      },
      create: {
        userLowId: userLowId!,
        userHighId: userHighId!,
        lowAddedHigh: true,
        highAddedLow: true,
        interactionScore: 0.8,
        lastHangoutAt: schedule.lastHangoutAt,
      },
    });

    for (const user of users) {
      await tx.busyBlock.deleteMany({ where: { userId: user.id, source: "seed" } });
      await tx.busyBlock.createMany({
        data: schedule.busyBlocks.map((block) => ({
          ...block,
          userId: user.id,
          source: "seed" as const,
          syncedAt: now,
        })),
      });
    }

    return users;
  });

  console.log(
    `Seeded ${seededUsers.map((user) => user.username).join(" + ")} with one shared Thursday window.`,
  );
  console.log(`Demo password: ${DEMO_PASSWORD}`);
  console.log(
    `Available locally: ${schedule.availableWindow.start.toISOString()} – ${schedule.availableWindow.end.toISOString()} (${DEMO_TIMEZONE})`,
  );
}

seed()
  .catch((error: unknown) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
