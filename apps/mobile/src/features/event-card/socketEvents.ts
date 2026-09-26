// Owner: Andy — every socket event carries only { event_id }; the client refetches GET /events/:id.
import { FriendSocketEvents, SocketEvents } from "@web/contract";

type Handler = (payload: { event_id: string }) => void;
/** The slice of a socket.io client this needs, so tests can pass a fake. */
export type EventEmitterLike = {
  on(event: string, fn: Handler): unknown;
  off(event: string, fn: Handler): unknown;
};

/** Calls `onEvent(eventId)` for every event:* message. Returns an unsubscribe function. */
export function onAnyEventUpdate(socket: EventEmitterLike, onEvent: (eventId: string) => void): () => void {
  return listen(socket, Object.values(SocketEvents), (p) => onEvent(p.event_id));
}

/** Calls `onChange()` for every friend:* message; listeners just refetch, so the payload is ignored. */
export function onAnyFriendUpdate(socket: EventEmitterLike, onChange: () => void): () => void {
  return listen(socket, Object.values(FriendSocketEvents), () => onChange());
}

function listen(socket: EventEmitterLike, names: string[], handler: Handler): () => void {
  for (const name of names) socket.on(name, handler);
  return () => {
    for (const name of names) socket.off(name, handler);
  };
}
