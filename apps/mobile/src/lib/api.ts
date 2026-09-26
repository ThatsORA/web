// Owner: Andy — typed API client. Every response is parsed with a contract schema.
import { API_PREFIX } from "@web/contract";
import type { z } from "zod";

const BASE = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000") + API_PREFIX;
let token: string | null = null;

export const setToken = (t: string | null) => {
  token = t;
};
export const getToken = () => token;

export async function api<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  init: { method?: string; body?: unknown } = {},
): Promise<z.infer<S>> {
  const res = await fetch(BASE + path, {
    method: init.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(json)}`);
  return schema.parse(json);
}
