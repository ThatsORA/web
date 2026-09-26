import type { AddressInfo } from "node:net";
import bcrypt from "bcryptjs";
import express from "express";
import { Prisma, type User } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), findUnique: vi.fn(), update: vi.fn() }));
// In-memory email_codes, enough for issueCode/consumeCode.
const codes = vi.hoisted(() => ({ rows: [] as Record<string, any>[], sent: [] as string[], sentTo: [] as string[], notices: [] as string[] }));
vi.mock("../../lib/prisma", () => ({
  prisma: {
    user: { ...mocks, findUnique: (args: { select?: { passwordChangedAt?: boolean } }) => args.select?.passwordChangedAt ? Promise.resolve({ passwordChangedAt: null }) : mocks.findUnique(args) },
    emailCode: {
      findFirst: async ({ where }: { where: { userId: string } }) => codes.rows.filter((r) => r.userId === where.userId).at(-1) ?? null,
      deleteMany: async ({ where }: { where: { id?: string; userId?: string } }) => {
        const before = codes.rows.length;
        codes.rows = codes.rows.filter((r) => !(r.id === where.id || r.userId === where.userId));
        return { count: before - codes.rows.length };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => codes.rows.push({ id: `c${codes.rows.length}`, attempts: 0, ...data }),
      updateMany: async ({ where }: { where: { id: string; attempts: { lt: number } } }) => {
        const row = codes.rows.find((r) => r.id === where.id && r.attempts < where.attempts.lt);
        if (row) row.attempts++;
        return { count: row ? 1 : 0 };
      },
    },
  },
}));
vi.mock("./email", () => ({
  sendCodeEmail: async (to: string, code: string) => void (codes.sent.push(code), codes.sentTo.push(to)),
  sendEmail: async (to: string) => void codes.notices.push(to),
}));
import { authRouter } from "./router";
import { signToken } from "../../lib/auth";
import { loginLimiter } from "./loginLimiter";
import { hashPassword, verifyPassword } from "./passwordHash";
import { passwordReasons } from "@web/contract";
let base: string;
let close: () => void;
const user: User = { id: "6f48fb35-1518-481d-ab60-cfd2dcc28acf", username: "ojas", email: "ojas@example.com", passwordHash: bcrypt.hashSync("correct-horse", 4), timezone: "America/New_York", homeLat: null, homeLng: null, travelMode: "DRIVE", createdAt: new Date(), emailVerifiedAt: new Date(), displayName: null, bio: null, usernameChangedAt: null, passwordChangedAt: null };
beforeAll(async () => {
  const app = express();
  app.use(express.json(), authRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => close());
beforeEach(() => {
  vi.clearAllMocks();
  codes.rows = [];
  codes.sent = [];
  codes.sentTo = [];
  codes.notices = [];
  for (const email of [user.email, "ghost@example.com"]) loginLimiter.succeeded(email, "127.0.0.1");
});
const call = (method: string, path: string, body?: unknown, auth = false) => fetch(base + path, { method, headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${signToken(user.id)}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
const signup = { email: "new@example.com", username: "new_user", password: "cedar harbor moon", timezone: "America/New_York" };

describe("auth router", () => {
  it("returns the shared weak-password reason before creating a user", async () => {
    const res = await call("POST", "/auth/signup", { ...signup, password: "short" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "weak_password", reason: passwordReasons.length });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("blocks the sixth attempt with Retry-After, including for unknown accounts", async () => {
    mocks.findUnique.mockResolvedValue(null);
    for (let i = 0; i < 5; i++) expect((await call("POST", "/auth/login", { email: "ghost@example.com", password: "wrong" })).status).toBe(401);
    const res = await call("POST", "/auth/login", { email: "ghost@example.com", password: "wrong" });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await res.json()).toEqual({ error: "too_many_attempts" });
    expect(mocks.findUnique).toHaveBeenCalledTimes(5);
  });
  it("lets an existing weak password log in and resets previous failures", async () => {
    mocks.findUnique.mockResolvedValue({ ...user, passwordHash: bcrypt.hashSync("short", 4) });
    for (let i = 0; i < 4; i++) await call("POST", "/auth/login", { email: user.email, password: "wrong" });
    expect((await call("POST", "/auth/login", { email: user.email, password: "short" })).status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await call("POST", "/auth/login", { email: user.email, password: "wrong" })).status).toBe(401);
  });
  it("signs up with a bcrypt hash and returns AuthResponse", async () => {
    mocks.create.mockImplementation(async ({ data }) => ({ ...user, ...data }));
    const res = await call("POST", "/auth/signup", signup);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ user_id: user.id, token: expect.any(String) });
    const { passwordHash, emailVerifiedAt } = mocks.create.mock.calls[0]![0].data;
    expect(await verifyPassword("cedar harbor moon", passwordHash)).toBe(true);
    expect(emailVerifiedAt).toBeNull(); // explicit null = unverified (backfill only fills missing fields)
    await vi.waitFor(() => expect(codes.sent).toHaveLength(1));
    expect(codes.sent[0]).toMatch(/^\d{6}$/);
    expect(JSON.stringify(codes.rows)).not.toContain(codes.sent[0]); // stored hashed
  });
  it("maps duplicate email/username (P2002) to 409", async () => {
    mocks.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "6" }));
    expect((await call("POST", "/auth/signup", signup)).status).toBe(409);
  });
  it("rejects invalid bodies with 400 before touching the DB", async () => {
    expect((await call("POST", "/auth/signup", { ...signup, password: "short" })).status).toBe(400);
    expect((await call("POST", "/auth/login", { email: "nope" })).status).toBe(400);
    expect((await call("PATCH", "/me", { home_lat: 91 }, true)).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("returns the same 401 for a wrong password and an unknown email", async () => {
    mocks.findUnique.mockResolvedValueOnce(user);
    const wrong = await call("POST", "/auth/login", { email: user.email, password: "wrong-horse" });
    mocks.findUnique.mockResolvedValueOnce(null);
    const unknown = await call("POST", "/auth/login", { email: "ghost@example.com", password: "whatever" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
  });
  it("logs in with the right password", async () => {
    mocks.findUnique.mockResolvedValueOnce(user);
    const res = await call("POST", "/auth/login", { email: user.email, password: "correct-horse" });
    expect(await res.json()).toMatchObject({ user_id: user.id });
  });
  it("GET /me requires auth and never returns the hash", async () => {
    expect((await call("GET", "/me")).status).toBe(401);
    mocks.findUnique.mockResolvedValueOnce(user);
    const body = await (await call("GET", "/me", undefined, true)).json();
    expect(body).toEqual({ id: user.id, username: "ojas", email: user.email, timezone: user.timezone, home_lat: null, home_lng: null, travel_mode: "DRIVE", email_verified: true, display_name: null, bio: null });
  });
  it("PATCH /me rounds home coordinates to 3 decimals", async () => {
    mocks.update.mockImplementation(async ({ data }) => ({ ...user, homeLat: data.homeLat, homeLng: data.homeLng }));
    const body = await (await call("PATCH", "/me", { home_lat: 25.76171, home_lng: -80.3756 }, true)).json();
    expect(mocks.update.mock.calls[0]![0]).toMatchObject({ where: { id: user.id }, data: { homeLat: 25.762, homeLng: -80.376 } });
    expect(body).toMatchObject({ home_lat: 25.762, home_lng: -80.376 });
  });
});

describe("email verification", () => {
  const unverified: User = { ...user, emailVerifiedAt: null };
  const verify = (code: string) => call("POST", "/auth/verify-email", { code }, true);
  const send = () => call("POST", "/auth/verify-email/send", undefined, true);

  it("sends a code, then refuses another within 60 s", async () => {
    mocks.findUnique.mockResolvedValue(unverified);
    expect((await send()).status).toBe(204);
    const again = await send();
    expect(again.status).toBe(429);
    expect(Number(again.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(codes.sent).toHaveLength(1);
  });

  it("409 when already verified", async () => {
    mocks.findUnique.mockResolvedValue(user);
    expect((await send()).status).toBe(409);
  });

  it("a wrong code burns an attempt; the right one verifies and is single-use", async () => {
    mocks.findUnique.mockResolvedValue(unverified);
    mocks.update.mockImplementation(async ({ data }) => ({ ...unverified, ...data }));
    await send();
    const code = codes.sent[0]!;
    const wrong = code === "000000" ? "111111" : "000000";
    expect(await (await verify(wrong)).json()).toEqual({ error: "wrong_code" });
    const ok = await verify(code);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ email_verified: true });
    expect(mocks.update.mock.calls[0]![0].data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await (await verify(code)).json()).toEqual({ error: "code_expired" });
  });

  it("locks after 5 attempts, even for the right code", async () => {
    mocks.findUnique.mockResolvedValue(unverified);
    await send();
    const code = codes.sent[0]!;
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await verify(wrong);
    expect(await (await verify(code)).json()).toEqual({ error: "code_expired" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects codes that aren't 6 digits", async () => {
    expect((await verify("12345")).status).toBe(400);
    expect((await verify("abcdef")).status).toBe(400);
  });
});

describe("profile", () => {
  const DAY = 24 * 3_600_000;
  const patch = (body: unknown) => call("PATCH", "/me", body, true);
  beforeEach(() => {
    // Like Prisma, undefined fields are left alone.
    mocks.update.mockImplementation(async ({ data }) => ({ ...user, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) }));
  });

  it("sets and clears display name and bio", async () => {
    expect(await (await patch({ display_name: "  Ojas P ", bio: "capstone" })).json()).toMatchObject({ display_name: "Ojas P", bio: "capstone" });
    expect(mocks.update.mock.calls[0]![0].data).toMatchObject({ displayName: "Ojas P", bio: "capstone" });
    await patch({ display_name: null, bio: "" });
    expect(mocks.update.mock.calls[1]![0].data).toMatchObject({ displayName: null, bio: null });
    expect((await patch({ display_name: "x".repeat(41) })).status).toBe(400);
    expect((await patch({ bio: "x".repeat(161) })).status).toBe(400);
  });

  it("changes the username at most once per 30 days", async () => {
    mocks.findUnique.mockResolvedValueOnce({ ...user, usernameChangedAt: new Date(Date.now() - 31 * DAY) });
    expect((await patch({ username: "ojas_p" })).status).toBe(200);
    expect(mocks.update.mock.calls[0]![0].data).toMatchObject({ username: "ojas_p", usernameChangedAt: expect.any(Date) });
    mocks.findUnique.mockResolvedValueOnce({ ...user, usernameChangedAt: new Date(Date.now() - DAY) });
    const cooldown = await patch({ username: "ojas_q" });
    expect(cooldown.status).toBe(409);
    expect(await cooldown.json()).toMatchObject({ error: "username_cooldown", retry_at: expect.any(String) });
    expect((await patch({ username: "Bad Name" })).status).toBe(400);
  });

  it("409s a taken username", async () => {
    mocks.findUnique.mockResolvedValueOnce(user);
    mocks.update.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "6" }));
    expect(await (await patch({ username: "riley" })).json()).toEqual({ error: "username_taken" });
  });

  it("email change: password first, code to the new address, switch on confirm, old address told", async () => {
    mocks.findUnique.mockImplementation(async ({ where }) => (where.email ? null : user));
    expect((await call("POST", "/me/email", { new_email: "new@example.com", password: "wrong" }, true)).status).toBe(401);
    expect((await call("POST", "/me/email", { new_email: "new@example.com", password: "correct-horse" }, true)).status).toBe(204);
    expect(codes.sentTo).toEqual(["new@example.com"]);
    const ok = await call("POST", "/me/email/confirm", { code: codes.sent[0] }, true);
    expect(await ok.json()).toMatchObject({ email: "new@example.com", email_verified: true });
    expect(codes.notices).toEqual([user.email]);
  });

  it("email change accepts passwords hashed in the current (sha256-prefixed) format", async () => {
    const current = { ...user, passwordHash: await hashPassword("cedar harbor moon") };
    mocks.findUnique.mockImplementation(async ({ where }) => (where.email ? null : current));
    expect((await call("POST", "/me/email", { new_email: "new@example.com", password: "cedar harbor moon" }, true)).status).toBe(204);
  });

  it("email change: 409 when the new address is taken", async () => {
    mocks.findUnique.mockImplementation(async ({ where }) => (where.email ? { ...user, id: "someone-else" } : user));
    expect((await call("POST", "/me/email", { new_email: "taken@example.com", password: "correct-horse" }, true)).status).toBe(409);
    expect(codes.sent).toEqual([]);
  });
});
