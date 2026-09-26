import { createServer } from "node:http";
import cron from "node-cron";
import { createApp } from "./app";
import { env } from "./env";
import { attachRealtime } from "./realtime";
import { sweepVoting } from "./modules/voting/lifecycle";
import { promoteDueInvites } from "./modules/groups/router";
import { cleanupChatMessages } from "./modules/chat";
import { syncAllGoogleCalendars } from "./modules/calendar/googleSync";

const server = createServer(createApp());
attachRealtime(server);

// Auto-proposals are off until a real scheduler lands (#196). Manual hangouts and /internal/run-matcher still work.
cron.schedule("0 * * * *", () => void cleanupChatMessages().catch((e: unknown) => console.error("cleanupChatMessages", e)));
cron.schedule("*/15 * * * *", () => void syncAllGoogleCalendars().catch((e: unknown) => console.error("syncAllGoogleCalendars", e)));
setInterval(() => void sweepVoting(), 15_000);
setInterval(() => void promoteDueInvites().catch((e: unknown) => console.error("promoteDueInvites", e)), 60_000);

server.listen(env.PORT, () => {
  console.log(`web server on :${env.PORT} (DEMO_MODE=${env.DEMO_MODE})`);
});
