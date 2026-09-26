// Owner: Ojas — Socket.io server. Clients auth with the JWT in the handshake
// (socket.handshake.auth.token) and join room user:{id}.
import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { userRoom, type ServerToClientEvents } from "@web/contract";
import { verifySessionToken } from "../lib/auth";

let io: Server<Record<string, never>, ServerToClientEvents> | null = null;

export function attachRealtime(server: HttpServer) {
  io = new Server(server, { cors: { origin: "*" } });
  io.use((socket, next) => {
    void verifySessionToken(String(socket.handshake.auth?.token ?? "")).then((userId) => {
      if (!userId) return next(new Error("unauthorized"));
      socket.data.userId = userId;
      next();
    }).catch(() => next(new Error("unauthorized")));
  });
  io.on("connection", (socket) => {
    void socket.join(userRoom(socket.data.userId as string));
  });
  return io;
}

/** Emit a thin event to each listed user. */
export function emitToUsers<E extends keyof ServerToClientEvents>(
  userIds: string[],
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
) {
  if (!io) return;
  for (const id of userIds) io.to(userRoom(id)).emit(event, ...args);
}

export * from "./push";

/** Close existing sessions after a committed password reset. */
export function disconnectUser(userId: string): void {
  io?.in(userRoom(userId)).disconnectSockets(true);
}
