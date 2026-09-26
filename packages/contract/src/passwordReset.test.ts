import { describe, expect, it } from "vitest";
import { PasswordResetRequest, PasswordResetConfirmRequest } from "./schemas";

describe("password reset requests", () => {
  it("requires an email address and a six-digit code", () => {
    expect(PasswordResetRequest.safeParse({ email: "not-an-email" }).success).toBe(false);
    const request = { email: "person@example.com", code: "012345", new_password: "cedar harbor moon" };
    expect(PasswordResetConfirmRequest.safeParse(request).success).toBe(true);
    for (const code of ["12345", "1234567", "abcdef"]) expect(PasswordResetConfirmRequest.safeParse({ ...request, code }).success).toBe(false);
  });
  it("leaves account-specific password policy to the server after code validation", () => {
    expect(PasswordResetConfirmRequest.safeParse({ email: "person@example.com", code: "123456", new_password: "short" }).success).toBe(true);
  });
});
