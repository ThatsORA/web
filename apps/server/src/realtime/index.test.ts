import { createServer } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { userRoom } from "@web/contract";
type Socket = { handshake: { auth: { token: string } }; data: { userId?: string } };
type Middleware = (socket: Socket, next: (error?: Error) => void) => void;
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), use: vi.fn(), on: vi.fn(), room: vi.fn(), disconnect: vi.fn() }));
vi.mock("../lib/prisma", () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
vi.mock("socket.io", () => ({ Server: class {
  use = mocks.use;
  on = mocks.on;
  in(room: string) { mocks.room(room); return { disconnectSockets: mocks.disconnect }; }
} }));
import { attachRealtime, disconnectUser } from "./index";
import { signToken } from "../lib/auth";

beforeEach(() => {
  vi.restoreAllMocks(); vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue({ passwordChangedAt: null });
  attachRealtime(createServer());
});
async function handshake(token: string) {
  const socket: Socket = { handshake: { auth: { token } }, data: {} };
  const middleware = mocks.use.mock.calls[0]![0] as Middleware;
  const error = await new Promise<Error | undefined>((resolve) => middleware(socket, resolve));
  return { error, socket };
}

describe("realtime session revocation", () => {
  it("rejects an old JWT on reconnect and accepts a fresh JWT", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now - 20);
    const old = signToken("user");
    mocks.findUnique.mockResolvedValue({ passwordChangedAt: new Date(now - 10) });
    clock.mockReturnValue(now);
    const fresh = signToken("user");
    expect((await handshake(old)).error?.message).toBe("unauthorized");
    const accepted = await handshake(fresh);
    expect(accepted.error).toBeUndefined();
    expect(accepted.socket.data.userId).toBe("user");
  });
  it("fails closed when account lookup fails", async () => {
    mocks.findUnique.mockRejectedValue(new Error("database unavailable"));
    expect((await handshake(signToken("user"))).error?.message).toBe("unauthorized");
  });
  it("disconnects only the reset user's room and underlying connections", () => {
    disconnectUser("user");
    expect(mocks.room).toHaveBeenCalledWith(userRoom("user"));
    expect(mocks.disconnect).toHaveBeenCalledWith(true);
  });
});
