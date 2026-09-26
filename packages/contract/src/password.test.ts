import { describe, expect, it } from "vitest";
import { checkPassword, passwordReasons } from "./password";
import { SignupRequest, LoginRequest } from "./schemas";
import { commonPasswords } from "./passwords/common-passwords";

const identity = { username: "ojas", email: "polakhare@example.com" };
describe("checkPassword", () => {
  it.each([
    ["short", passwordReasons.length],
    ["a".repeat(31), passwordReasons.length],
    ["basketball", passwordReasons.common],
    ["BASKETBALL", passwordReasons.common],
    ["hello-OJAS-world", passwordReasons.username],
    ["POLAKHARE moonlight", passwordReasons.email],
    ["!!!!!!!!!!", passwordReasons.repeated],
    ["aaaaaaaaaa", passwordReasons.repeated],
    ["1234567890", passwordReasons.sequence],
    ["9876543210", passwordReasons.sequence],
    ["abcdefghij", passwordReasons.sequence],
    ["qwertyuiop", passwordReasons.sequence],
  ])("rejects %s with its reason", (password, reason) => {
    expect(checkPassword(password, identity)).toEqual({ ok: false, reason });
  });
  it("bundles the entire upstream top-10k list", () => {
    expect(commonPasswords).toHaveLength(10001);
    expect(commonPasswords).toContain("basketball");
  });
  it.each(["aB3!xy", "cedar harbor moon", "web-demo-2026", "c".repeat(29) + "z", "🌱".repeat(5) + "🌙"])("allows %s without composition rules", (password) => {
    expect(checkPassword(password, identity)).toEqual({ ok: true });
  });
  it("ignores 1–2 character email local parts, which would block nearly everything", () => {
    expect(checkPassword("cedar harbor moon", { username: "ojas", email: "a@example.com" })).toEqual({ ok: true });
    expect(checkPassword("cedar harbor moon", { username: "ojas", email: "ce@example.com" })).toEqual({ ok: true });
    expect(checkPassword("cedar harbor moon", { username: "ojas", email: "harbor@example.com" })).toEqual({ ok: false, reason: passwordReasons.email });
  });
  it("does not treat empty identity fields as substrings", () => {
    expect(checkPassword("cedar harbor moon", { username: "", email: "" })).toEqual({ ok: true });
  });
  it("enforces the policy on SignupRequest, but preserves old login passwords", () => {
    const result = SignupRequest.safeParse({ ...identity, password: "short", timezone: "UTC" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]).toMatchObject({ path: ["password"], message: passwordReasons.length });
    expect(LoginRequest.safeParse({ identifier: identity.email, password: "short" }).success).toBe(true);
  });
});
