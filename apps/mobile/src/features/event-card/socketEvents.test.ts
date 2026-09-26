import { FriendSocketEvents, SocketEvents } from "@web/contract";
import { describe, expect, it } from "vitest";
import { onAnyEventUpdate, onAnyFriendUpdate, type EventEmitterLike } from "./socketEvents";

function fakeSocket() {
  const handlers = new Map<string, Set<(p: { event_id: string }) => void>>();
  const socket: EventEmitterLike = {
    on: (e, fn) => handlers.set(e, (handlers.get(e) ?? new Set()).add(fn)),
    off: (e, fn) => handlers.get(e)?.delete(fn),
  };
  const emit = (e: string, p: { event_id: string }) => handlers.get(e)?.forEach((fn) => fn(p));
  return { socket, emit };
}

describe("onAnyEventUpdate", () => {
  it("reports the event id for every contract event", () => {
    const { socket, emit } = fakeSocket();
    const seen: string[] = [];
    onAnyEventUpdate(socket, (id) => seen.push(id));
    Object.values(SocketEvents).forEach((name, i) => emit(name, { event_id: `e${i}` }));
    expect(seen).toEqual(Object.values(SocketEvents).map((_, i) => `e${i}`));
  });

  it("stops after unsubscribe", () => {
    const { socket, emit } = fakeSocket();
    const seen: string[] = [];
    const off = onAnyEventUpdate(socket, (id) => seen.push(id));
    off();
    emit(SocketEvents.eventProgress, { event_id: "e" });
    expect(seen).toEqual([]);
  });
});

describe("onAnyFriendUpdate", () => {
  it("fires on friend:request and friend:accepted, and not on event:* messages", () => {
    const { socket, emit } = fakeSocket();
    let changes = 0;
    const events: string[] = [];
    onAnyFriendUpdate(socket, () => changes++);
    onAnyEventUpdate(socket, (id) => events.push(id));
    emit(FriendSocketEvents.friendRequest, { event_id: "ignored" });
    emit(FriendSocketEvents.friendAccepted, { event_id: "ignored" });
    emit(SocketEvents.eventCreated, { event_id: "e1" });
    expect(changes).toBe(2);
    expect(events).toEqual(["e1"]);
  });

  it("stops after unsubscribe", () => {
    const { socket, emit } = fakeSocket();
    let changes = 0;
    const off = onAnyFriendUpdate(socket, () => changes++);
    off();
    emit(FriendSocketEvents.friendRequest, { event_id: "ignored" });
    expect(changes).toBe(0);
  });
});
