import { describe, expect, it } from "vitest";
import { authErrorMessage, verifyErrorMessage } from "./errors";

describe("authErrorMessage", () => {
  it("maps server statuses to messages", () => {
    expect(authErrorMessage(409, "signup")).toMatch(/taken/);
    expect(authErrorMessage(401, "login")).toMatch(/Wrong email, username or password/);
    expect(authErrorMessage(400, "login")).toMatch(/email or username/);
    expect(authErrorMessage(400, "signup")).toMatch(/6–30 characters/);
    expect(authErrorMessage(429, "login")).toMatch(/Wait 15 minutes/);
    expect(authErrorMessage(503, "signup", "email_unavailable")).toMatch(/verification email/);
    expect(authErrorMessage(null, "login")).toMatch(/server/);
  });
});

describe("verifyErrorMessage", () => {
  it("maps server error codes and statuses to messages", () => {
    expect(verifyErrorMessage(400, "wrong_code")).toMatch(/isn't right/);
    expect(verifyErrorMessage(400, "code_expired")).toMatch(/new one/);
    expect(verifyErrorMessage(429)).toMatch(/Wait a minute/);
    expect(verifyErrorMessage(400)).toMatch(/6-digit/);
    expect(verifyErrorMessage(503, "email_unavailable")).toMatch(/send an email/);
    expect(verifyErrorMessage(null)).toMatch(/server/);
  });
});
