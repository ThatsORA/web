// Owner: Ojas — Socket.io server. Clients auth with the JWT in the handshake
// (socket.handshake.auth.token) and join room user:{id}.
import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { userRoom, type ServerToClientEvents } from "@web/contract";
import { verifyToken } from "../lib/auth";

export { pushVenueChanged } from "./push";

let io: Server<Record<string, never>, ServerToClientEvents> | null = null;

export function attachRealtime(server: HttpServer) {
  io = new Server(server, { cors: { origin: "*" } });
  io.use((socket, next) => {
    const userId = verifyToken(String(socket.handshake.auth?.token ?? ""));
    if (!userId) return next(new Error("unauthorized"));
    socket.data.userId = userId;
    next();
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
