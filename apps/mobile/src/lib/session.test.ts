import { beforeEach, describe, expect, it } from "vitest";
import { getToken, setToken } from "./api";
import { createSession, TOKEN_KEY, type KeyValueStore } from "./session";

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItemAsync: async (k) => data.get(k) ?? null,
    setItemAsync: async (k, v) => void data.set(k, v),
    deleteItemAsync: async (k) => void data.delete(k),
  };
}

beforeEach(() => setToken(null));

describe("session", () => {
  it("restore returns null and leaves the client signed out when nothing is stored", async () => {
    const session = createSession(memoryStore());
    expect(await session.restore()).toBeNull();
    expect(getToken()).toBeNull();
  });

  it("save persists the token and sets it on the api client", async () => {
    const store = memoryStore();
    await createSession(store).save("jwt-123");
    expect(store.data.get(TOKEN_KEY)).toBe("jwt-123");
    expect(getToken()).toBe("jwt-123");
  });

  it("restore picks up a token saved in an earlier launch", async () => {
    const store = memoryStore();
    await createSession(store).save("jwt-abc");
    setToken(null); // simulate app restart
    expect(await createSession(store).restore()).toBe("jwt-abc");
    expect(getToken()).toBe("jwt-abc");
  });

  it("clear removes the token everywhere", async () => {
    const store = memoryStore();
    const session = createSession(store);
    await session.save("jwt-xyz");
    await session.clear();
    expect(store.data.has(TOKEN_KEY)).toBe(false);
    expect(getToken()).toBeNull();
  });
});
