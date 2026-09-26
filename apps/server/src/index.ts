import { createServer } from "node:http";
import cron from "node-cron";
import { createApp } from "./app";
import { env } from "./env";
import { attachRealtime } from "./realtime";
import { triggerMatcher } from "./modules/matching/matcher";
import { sweepVoting } from "./modules/voting/lifecycle";

const server = createServer(createApp());
attachRealtime(server);

cron.schedule("*/5 * * * *", () => void triggerMatcher());
setInterval(() => void sweepVoting(), 15_000);

server.listen(env.PORT, () => {
  console.log(`web server on :${env.PORT} (DEMO_MODE=${env.DEMO_MODE})`);
});
