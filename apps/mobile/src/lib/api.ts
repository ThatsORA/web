// Owner: Andy — typed API client. Every response is parsed with a contract schema.
import { API_PREFIX } from "@web/contract";
import type { z } from "zod";

/** Server origin; the socket connects here, REST calls go to API_URL + API_PREFIX. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const BASE = API_URL + API_PREFIX;
let token: string | null = null;

export const setToken = (t: string | null) => {
  token = t;
};
export const getToken = () => token;

/** A non-2xx response. `status` lets callers handle e.g. 409 from report-closed. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    super(`${status} ${JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

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
  if (!res.ok) throw new ApiError(res.status, json);
  return schema.parse(json);
}
