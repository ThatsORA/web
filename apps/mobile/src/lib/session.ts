// Owner: Andy — persists the JWT and keeps the api() client's token in sync.
// Storage is injected so this stays testable; secureSession.ts binds it to expo-secure-store.
import { setToken } from "./api";

export type KeyValueStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

export const TOKEN_KEY = "web.auth.token";

/** The server signs JWTs with the user ID in `sub`; this is only a UI key, not an auth check. */
export function userIdFromToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded: unknown = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
    if (typeof decoded !== "object" || decoded === null || !("sub" in decoded)) return null;
    return typeof decoded.sub === "string" ? decoded.sub : null;
  } catch {
    return null;
  }
}

export function createSession(store: KeyValueStore) {
  return {
    /** Reads the stored token (if any) into the api client. Call once at startup. */
    async restore(): Promise<string | null> {
      const token = await store.getItemAsync(TOKEN_KEY);
      setToken(token || null);
      return token || null;
    },
    /** Call after sign up / login with AuthResponse.token. */
    async save(token: string): Promise<void> {
      await store.setItemAsync(TOKEN_KEY, token);
      setToken(token);
    },
    async clear(): Promise<void> {
      await store.deleteItemAsync(TOKEN_KEY);
      setToken(null);
    },
  };
}

export type Session = ReturnType<typeof createSession>;
