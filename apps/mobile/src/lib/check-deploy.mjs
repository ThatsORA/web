import { io } from "socket.io-client";

const [baseUrl] = process.argv.slice(2);
const token = process.env.WEB_CHECK_JWT;

if (!baseUrl || !token) {
  console.error("Usage: WEB_CHECK_JWT=<user JWT> node apps/mobile/scripts/check-deploy.mjs <https://app-url>");
  process.exit(2);
}

const url = baseUrl.replace(/\/$/, "");
const health = await fetch(`${url}/health`, { signal: AbortSignal.timeout(10_000) });
if (!health.ok || (await health.json()).ok !== true) {
  throw new Error(`Health check failed (${health.status})`);
}
console.log("Health check passed");

const socket = io(url, {
  auth: { token },
  reconnection: false,
  timeout: 10_000,
});

try {
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  console.log("Authenticated Socket.io connection passed");
} finally {
  socket.disconnect();
}
