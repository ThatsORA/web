import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";

let base = "";
let close: () => void;

beforeAll(async () => {
  const server = createApp().listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => close());

describe("app skeleton", () => {
  it("serves /health", async () => {
    const res = await fetch(`${base}/health`);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("protects authed routes", async () => {
    const res = await fetch(`${base}/api/v1/events`);
    expect(res.status).toBe(401);
  });

  it("stubs public routes with 501 until implemented", async () => {
    const res = await fetch(`${base}/api/v1/auth/signup`, { method: "POST" });
    expect(res.status).toBe(501);
  });
});
