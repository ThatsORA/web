import type { AddressInfo } from "node:net";
import type { EmailCode } from "@prisma/client";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: [] as EmailCode[], passwordHash: "old-hash", changedAt: null as Date | null, failUpdate: false }));
const mocks = vi.hoisted(() => ({ send: vi.fn(), lookup: vi.fn(), disconnect: vi.fn() }));
vi.mock("../../lib/prisma", () => {
  const user = {
    findUnique: mocks.lookup,
    update: async ({ data }: { data: { passwordHash: string; passwordChangedAt: Date } }) => {
      if (state.failUpdate) throw new Error("update failed");
      state.passwordHash = data.passwordHash;
      state.changedAt = data.passwordChangedAt;
    },
  };
  const emailCode = {
    findFirst: async ({ where }: { where: { userId: string; purpose: string } }) => state.rows.filter((r) => r.userId === where.userId && r.purpose === where.purpose).at(-1) ?? null,
    create: async ({ data }: { data: Omit<EmailCode, "id" | "attempts"> }) => state.rows.push({ ...data, id: String(state.rows.length), attempts: 0 }),
    deleteMany: async ({ where }: { where: { id?: string; userId?: string; purpose?: string } }) => {
      const count = state.rows.length;
      state.rows = state.rows.filter((r) => !(where.id ? r.id === where.id : r.userId === where.userId && r.purpose === where.purpose));
      return { count: count - state.rows.length };
    },
    updateMany: async ({ where }: { where: { id: string; attempts: { lt: number } } }) => {
      const row = state.rows.find((r) => r.id === where.id && r.attempts < where.attempts.lt);
      if (row) row.attempts++;
      return { count: row ? 1 : 0 };
    },
  };
  return { prisma: { user, emailCode, $transaction: async (run: (client: { user: typeof user; emailCode: typeof emailCode }) => Promise<unknown>) => {
    const snapshot = structuredClone(state);
    try { return await run({ user, emailCode }); }
    catch (error) { Object.assign(state, snapshot); throw error; }
  } } };
});
vi.mock("../../realtime", () => ({ disconnectUser: mocks.disconnect }));
vi.mock("./email", () => ({ sendCodeEmail: mocks.send }));
import { passwordResetRouter } from "./passwordReset";
import { verifyPassword } from "./passwordHash";

const known = { id: "user", email: "ojas@example.com", username: "ojas" };
const password = "cedar harbor moon";
let base: string;
let close: () => void;
beforeAll(async () => {
  const app = express();
  app.use(express.json(), passwordResetRouter);
  app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: "internal_error" }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => close());
beforeEach(() => {
  vi.clearAllMocks();
  state.rows = []; state.passwordHash = "old-hash"; state.changedAt = null; state.failUpdate = false;
  mocks.lookup.mockImplementation(async ({ where }: { where: { email: string } }) => where.email === known.email ? known : null);
  mocks.send.mockResolvedValue(undefined);
});
const post = (path: string, body: unknown) => fetch(base + "/auth/password-reset/" + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const request = (email = known.email) => post("request", { email });
const confirm = (code: string, new_password = password, email = known.email) => post("confirm", { email, code, new_password });
async function sentCode() {
  await request();
  await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledOnce());
  return mocks.send.mock.calls[0]![1] as string;
}

describe("password reset", () => {
  it("returns identical 202 responses for known, unknown and cooldown addresses", async () => {
    const first = await request();
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledOnce());
    for (const response of [first, await request("absent@example.com"), await request()]) {
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ accepted: true });
      expect(response.headers.get("retry-after")).toBeNull();
    }
    expect(mocks.send).toHaveBeenCalledOnce();
  });
  it("responds before account lookup or email delivery resolves", async () => {
    mocks.lookup.mockReturnValueOnce(new Promise(() => {}));
    expect((await request()).status).toBe(202);
    mocks.send.mockReturnValueOnce(new Promise(() => {}));
    expect((await request()).status).toBe(202);
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledOnce());
  });
  it("keeps provider failures out of the public response", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.send.mockRejectedValueOnce(new Error("provider unavailable"));
    const response = await request();
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith("Password-reset email delivery failed"));
    log.mockRestore();
  });
  it("does not reveal accounts through invalid code plus weak password", async () => {
    for (const email of [known.email, "absent@example.com"]) {
      const response = await confirm("000000", "short", email);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_reset_code" });
    }
  });
  it("hashes the new password, records reset time and invalidates all reset codes", async () => {
    const code = await sentCode();
    const response = await confirm(code);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reset: true });
    expect(await verifyPassword(password, state.passwordHash)).toBe(true);
    expect(state.changedAt).toBeInstanceOf(Date);
    expect(state.rows).toHaveLength(0);
    expect(mocks.disconnect).toHaveBeenCalledWith(known.id);
    expect((await confirm(code)).status).toBe(400);
  });
  it("commits wrong attempts and locks after five, including the correct code", async () => {
    const code = await sentCode();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect((await confirm(wrong)).status).toBe(400);
    expect(state.rows[0]?.attempts).toBe(5);
    expect((await confirm(code)).status).toBe(400);
    expect(state.passwordHash).toBe("old-hash");
  });
  it("preserves the code for a valid-code weak password and for a failed update", async () => {
    const code = await sentCode();
    const weak = await confirm(code, "ojas in moonlight");
    expect(weak.status).toBe(400);
    expect(await weak.json()).toMatchObject({ error: "weak_password" });
    expect(state.rows[0]?.attempts).toBe(0);
    expect(mocks.disconnect).not.toHaveBeenCalled();
    state.failUpdate = true;
    expect((await confirm(code)).status).toBe(500);
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]?.attempts).toBe(0);
    expect(mocks.disconnect).not.toHaveBeenCalled();
    state.failUpdate = false;
    expect((await confirm(code)).status).toBe(200);
  });
  it("rejects expired codes", async () => {
    const code = await sentCode();
    state.rows[0]!.expiresAt = new Date(0);
    expect((await confirm(code)).status).toBe(400);
    expect(state.passwordHash).toBe("old-hash");
  });
});
