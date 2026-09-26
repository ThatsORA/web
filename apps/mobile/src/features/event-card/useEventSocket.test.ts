import { beforeEach, describe, expect, it, vi } from "vitest";
import { getToken, setToken, subscribeToken } from "../../lib/api";

const mockSockets: Array<{
  url: string;
  opts: { auth?: { token: string } };
  disconnect: () => void;
  on: (event: string, fn: unknown) => void;
  off: (event: string, fn: unknown) => void;
}> = [];

vi.mock("socket.io-client", () => ({
  io: vi.fn((url: string, opts: { auth?: { token: string } }) => {
    const s = {
      url,
      opts,
      disconnect: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };
    mockSockets.push(s);
    return s;
  }),
}));

describe("useEventSocket & token reactivity", () => {
  beforeEach(() => {
    mockSockets.length = 0;
    setToken(null);
    vi.clearAllMocks();
  });

  it("notifies subscribers when token changes via subscribeToken", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToken(listener);

    setToken("jwt-1");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getToken()).toBe("jwt-1");

    setToken(null);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getToken()).toBeNull();

    unsubscribe();
    setToken("jwt-2");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
