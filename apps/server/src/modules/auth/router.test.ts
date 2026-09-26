import type { AddressInfo } from "node:net";
import bcrypt from "bcryptjs";
import express from "express";
import { Prisma, type User } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), findUnique: vi.fn(), update: vi.fn() }));
vi.mock("../../lib/prisma", () => ({ prisma: { user: mocks } }));
import { authRouter } from "./router";
import { signToken } from "../../lib/auth";
let base: string;
let close: () => void;
const user: User = { id: "6f48fb35-1518-481d-ab60-cfd2dcc28acf", username: "ojas", email: "ojas@example.com", passwordHash: bcrypt.hashSync("correct-horse", 4), timezone: "America/New_York", homeLat: null, homeLng: null, travelMode: "DRIVE", createdAt: new Date() };
beforeAll(async () => {
  const app = express();
  app.use(express.json(), authRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => close());
beforeEach(() => vi.clearAllMocks());
const call = (method: string, path: string, body?: unknown, auth = false) => fetch(base + path, { method, headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${signToken(user.id)}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
const signup = { email: "new@example.com", username: "new_user", password: "longenough", timezone: "America/New_York" };

describe("auth router", () => {
  it("signs up with a bcrypt hash and returns AuthResponse", async () => {
    mocks.create.mockImplementation(async ({ data }) => ({ ...user, ...data }));
    const res = await call("POST", "/auth/signup", signup);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ user_id: user.id, token: expect.any(String) });
    const { passwordHash } = mocks.create.mock.calls[0]![0].data;
    expect(await bcrypt.compare("longenough", passwordHash)).toBe(true);
  });
  it("maps duplicate email/username (P2002) to 409", async () => {
    mocks.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "6" }));
    expect((await call("POST", "/auth/signup", signup)).status).toBe(409);
  });
  it("rejects invalid bodies with 400 before touching the DB", async () => {
    expect((await call("POST", "/auth/signup", { ...signup, password: "short" })).status).toBe(400);
    expect((await call("POST", "/auth/login", { password: "correct-horse" })).status).toBe(400);
    expect((await call("POST", "/auth/login", { identifier: "   ", password: "correct-horse" })).status).toBe(400);
    expect((await call("POST", "/auth/login", { identifier: "ojas" })).status).toBe(400);
    expect((await call("PATCH", "/me", { home_lat: 91 }, true)).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("returns the same 401 for a wrong password, an unknown email and an unknown username", async () => {
    mocks.findUnique.mockResolvedValueOnce(user);
    const wrong = await call("POST", "/auth/login", { identifier: user.email, password: "wrong-horse" });
    mocks.findUnique.mockResolvedValueOnce(null);
    const unknownEmail = await call("POST", "/auth/login", { identifier: "ghost@example.com", password: "whatever" });
    mocks.findUnique.mockResolvedValueOnce(null);
    const unknownUsername = await call("POST", "/auth/login", { identifier: "ghost", password: "whatever" });
    const bodies = await Promise.all([wrong, unknownEmail, unknownUsername].map((r) => r.json()));
    expect([wrong.status, unknownEmail.status, unknownUsername.status]).toEqual([401, 401, 401]);
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
  });
  it.each([
    ["email", "ojas@example.com", { email: "ojas@example.com" }],
    ["username", "ojas", { username: "ojas" }],
    ["mixed-case email with spaces", "  Ojas@Example.COM ", { email: "ojas@example.com" }],
    ["mixed-case username with spaces", " OJAS  ", { username: "ojas" }],
  ])("logs in with the %s", async (_, identifier, where) => {
    mocks.findUnique.mockResolvedValueOnce(user);
    const res = await call("POST", "/auth/login", { identifier, password: "correct-horse" });
    expect(await res.json()).toMatchObject({ user_id: user.id });
    expect(mocks.findUnique).toHaveBeenCalledWith({ where });
  });
  it("GET /me requires auth and never returns the hash", async () => {
    expect((await call("GET", "/me")).status).toBe(401);
    mocks.findUnique.mockResolvedValueOnce(user);
    const body = await (await call("GET", "/me", undefined, true)).json();
    expect(body).toEqual({ id: user.id, username: "ojas", email: user.email, timezone: user.timezone, home_lat: null, home_lng: null, travel_mode: "DRIVE" });
  });
  it("PATCH /me rounds home coordinates to 3 decimals", async () => {
    mocks.update.mockImplementation(async ({ data }) => ({ ...user, homeLat: data.homeLat, homeLng: data.homeLng }));
    const body = await (await call("PATCH", "/me", { home_lat: 25.76171, home_lng: -80.3756 }, true)).json();
    expect(mocks.update.mock.calls[0]![0]).toMatchObject({ where: { id: user.id }, data: { homeLat: 25.762, homeLng: -80.376 } });
    expect(body).toMatchObject({ home_lat: 25.762, home_lng: -80.376 });
  });
});
