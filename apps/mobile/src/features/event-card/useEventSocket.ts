// Owner: Andy — one socket per app session, authenticated with the JWT in the handshake.
// The server joins it to user:{id}; every event:* message just names an event to refetch.
import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { API_URL, getToken } from "../../lib/api";
import { onAnyEventUpdate, type EventEmitterLike } from "./socketEvents";

/**
 * Calls `onEvent(eventId)` on any event:* message, and `onConnect()` on every (re)connect
 * so the caller can catch up on anything missed while the phone was asleep.
 */
export function useEventSocket(onEvent: (eventId: string) => void, onConnect?: () => void) {
  const handlers = useRef({ onEvent, onConnect });

  useEffect(() => {
    handlers.current = { onEvent, onConnect };
  }, [onEvent, onConnect]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const socket = io(API_URL, { auth: { token }, transports: ["websocket"] });
    const off = onAnyEventUpdate(socket as unknown as EventEmitterLike, (id) => handlers.current.onEvent(id));
    const connected = () => handlers.current.onConnect?.();
    socket.on("connect", connected);
    return () => {
      off();
      socket.off("connect", connected);
      socket.disconnect();
    };
  }, []);
}
