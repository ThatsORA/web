// Owner: Andy — one socket per app session, authenticated with the JWT in the handshake.
// The server joins it to user:{id}; every message just names something to refetch.
// useSessionSocket() owns the socket (mounted once in the (main) layout); screens subscribe with
// useEventSocket / useFriendEvents, so the Friends tab gets live updates without a second socket.
import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { API_URL, useToken } from "../../lib/api";
import { onAnyEventUpdate, onAnyFriendUpdate, type EventEmitterLike } from "./socketEvents";

const eventListeners = new Set<(eventId: string) => void>();
const connectListeners = new Set<() => void>();
const friendListeners = new Set<() => void>();

/** Opens the session's one socket; reconnects as the new user when the token changes (#83). */
export function useSessionSocket() {
  const token = useToken();

  useEffect(() => {
    if (!token) return;
    const socket = io(API_URL, { auth: { token }, transports: ["websocket"] });
    const emitter = socket as unknown as EventEmitterLike;
    const offEvents = onAnyEventUpdate(emitter, (id) => eventListeners.forEach((fn) => fn(id)));
    const offFriends = onAnyFriendUpdate(emitter, () => friendListeners.forEach((fn) => fn()));
    const connected = () => connectListeners.forEach((fn) => fn());
    socket.on("connect", connected);
    return () => {
      offEvents();
      offFriends();
      socket.off("connect", connected);
      socket.disconnect();
    };
  }, [token]);
}

/**
 * Calls `onEvent(eventId)` on any event:* message, and `onConnect()` on every (re)connect
 * so the caller can catch up on anything missed while the phone was asleep.
 */
export function useEventSocket(onEvent: (eventId: string) => void, onConnect?: () => void) {
  useListener(eventListeners, onEvent);
  useListener(connectListeners, onConnect);
}

/** Calls `onChange()` when a friend request arrives or one of mine is accepted, so friends screens can refetch. */
export function useFriendEvents(onChange: () => void) {
  useListener(friendListeners, onChange);
}

/** Keeps the latest `fn` registered in `set` while mounted, without resubscribing on every render. */
function useListener<A extends unknown[]>(set: Set<(...args: A) => void>, fn?: (...args: A) => void) {
  const latest = useRef(fn);

  useEffect(() => {
    latest.current = fn;
  }, [fn]);

  useEffect(() => {
    const call = (...args: A) => latest.current?.(...args);
    set.add(call);
    return () => {
      set.delete(call);
    };
  }, [set]);
}
