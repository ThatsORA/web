import { createServer } from "node:http";
import cron from "node-cron";
import { createApp } from "./app";
import { env } from "./env";
import { attachRealtime } from "./realtime";
import { triggerMatcher } from "./modules/matching/matcher";
import { sweepVoting } from "./modules/voting/lifecycle";
import { cleanupChatMessages } from "./modules/chat";
import { syncAllGoogleCalendars } from "./modules/calendar/googleSync";

const server = createServer(createApp());
attachRealtime(server);

cron.schedule("*/5 * * * *", () => void triggerMatcher());
cron.schedule("0 * * * *", () => void cleanupChatMessages().catch((e: unknown) => console.error("cleanupChatMessages", e)));
cron.schedule("*/15 * * * *", async () => {
  await syncAllGoogleCalendars();
  await triggerMatcher();
});
setInterval(() => void sweepVoting(), 15_000);

server.listen(env.PORT, () => {
  console.log(`web server on :${env.PORT} (DEMO_MODE=${env.DEMO_MODE})`);
});
