import { SocketEvents } from "@web/contract";
import { describe, expect, it } from "vitest";
import { onAnyEventUpdate, type EventEmitterLike } from "./socketEvents";

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
    expect(seen).toEqual(["e0", "e1", "e2", "e3"]);
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
