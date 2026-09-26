import type { AddressInfo } from "node:net";
import express from "express";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { user: mocks } }));
import { requireAuth, signToken, verifyToken } from "./auth";
import { env } from "../env";

let base: string;
let close: () => void;
beforeAll(async () => {
  const app = express();
  app.get("/protected", requireAuth, (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => close());
beforeEach(() => { vi.restoreAllMocks(); mocks.findUnique.mockResolvedValue({ passwordChangedAt: null }); });
const call = (token: string) => fetch(base + "/protected", { headers: { authorization: `Bearer ${token}` } });

describe("password-reset JWT revocation", () => {
  it("rejects tokens before reset but accepts a fresh login in the same second", async () => {
    const second = Math.floor(Date.now() / 1000) * 1000;
    const now = vi.spyOn(Date, "now").mockReturnValue(second + 100);
    const old = signToken("user");
    mocks.findUnique.mockResolvedValue({ passwordChangedAt: new Date(second + 300) });
    now.mockReturnValue(second + 400);
    const fresh = signToken("user");
    expect((await call(old)).status).toBe(401);
    expect((await call(fresh)).status).toBe(200);
    expect(verifyToken(fresh)).toBe("user"); // socket helper's existing return contract
  });
  it("converts legacy iat seconds and permits accounts that have never reset", async () => {
    const second = Math.floor(Date.now() / 1000);
    const token = jwt.sign({ sub: "user", iat: second - 2 }, env.JWT_SECRET);
    expect((await call(token)).status).toBe(200);
    mocks.findUnique.mockResolvedValue({ passwordChangedAt: new Date((second - 1) * 1000) });
    expect((await call(token)).status).toBe(401);
  });
  it("rejects missing or malformed issue times after reset and deleted accounts", async () => {
    mocks.findUnique.mockResolvedValue({ passwordChangedAt: new Date(1) });
    const missing = jwt.sign({ sub: "user" }, env.JWT_SECRET, { noTimestamp: true });
    const malformed = jwt.sign({ sub: "user", issued_at_ms: "tomorrow" }, env.JWT_SECRET);
    expect((await call(missing)).status).toBe(401);
    expect((await call(malformed)).status).toBe(401);
    mocks.findUnique.mockResolvedValue(null);
    expect((await call(signToken("deleted"))).status).toBe(401);
  });
});
