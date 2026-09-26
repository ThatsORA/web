import { describe, expect, it } from "vitest";
import { CODE_TTL_MS, MAX_ATTEMPTS, checkCode, cooldownLeftMs, hashCode, newCode } from "./emailCode";

const now = new Date("2026-09-26T12:00:00Z");
const row = (over: Partial<{ codeHash: string; expiresAt: Date; attempts: number }> = {}) => ({
  codeHash: hashCode("123456"),
  expiresAt: new Date(now.getTime() + CODE_TTL_MS),
  attempts: 0,
  ...over,
});

describe("email codes", () => {
  it("are 6 digits, zero-padded", () => {
    for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^\d{6}$/);
  });

  it("are stored as a keyed hash, never the code", () => {
    expect(hashCode("123456")).not.toContain("123456");
    expect(hashCode("123456")).toBe(hashCode("123456"));
    expect(hashCode("123456")).not.toBe(hashCode("123457"));
  });

  it("accepts the right code and rejects a wrong one", () => {
    expect(checkCode(row(), "123456", now)).toBe("ok");
    expect(checkCode(row(), "654321", now)).toBe("wrong");
    expect(checkCode(null, "123456", now)).toBe("missing");
  });

  it("expire after 10 minutes", () => {
    expect(checkCode(row({ expiresAt: new Date(now.getTime() - 1) }), "123456", now)).toBe("expired");
    expect(checkCode(row({ expiresAt: now }), "123456", now)).toBe("expired");
  });

  it(`lock after ${MAX_ATTEMPTS} attempts, even for the right code`, () => {
    expect(checkCode(row({ attempts: MAX_ATTEMPTS - 1 }), "123456", now)).toBe("ok");
    expect(checkCode(row({ attempts: MAX_ATTEMPTS }), "123456", now)).toBe("locked");
  });

  it("can be resent after a 60 s cooldown", () => {
    expect(cooldownLeftMs(null, now)).toBe(0);
    expect(cooldownLeftMs(new Date(now.getTime() - 10_000), now)).toBe(50_000);
    expect(cooldownLeftMs(new Date(now.getTime() - 60_000), now)).toBe(0);
  });
});
