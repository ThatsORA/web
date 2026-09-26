import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./passwordHash";

describe("password hashing", () => {
  it("rejects malformed stored hashes without throwing", async () => {
    expect(await verifyPassword("cedar harbor moon", "sha256:broken")).toBe(false);
    expect(await verifyPassword("cedar harbor moon", "broken")).toBe(false);
  });
  it.each(["a".repeat(127), "🌱".repeat(127)])("distinguishes passwords after bcrypt's 72-byte boundary", async (prefix) => {
    const hash = await hashPassword(prefix + "x");
    expect(await verifyPassword(prefix + "x", hash)).toBe(true);
    expect(await verifyPassword(prefix + "y", hash)).toBe(false);
  });
  it("preserves legacy bcrypt login without applying the new policy", async () => {
    const hash = await bcrypt.hash("short", 4);
    expect(await verifyPassword("short", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});
