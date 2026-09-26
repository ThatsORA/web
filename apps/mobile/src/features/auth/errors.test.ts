import { describe, expect, it } from "vitest";
import { authErrorMessage, verifyErrorMessage } from "./errors";

describe("authErrorMessage", () => {
  it("maps server statuses to messages", () => {
    expect(authErrorMessage(409, "signup")).toMatch(/taken/);
    expect(authErrorMessage(401, "login")).toMatch(/Wrong email or password/);
    expect(authErrorMessage(400, "signup")).toMatch(/8\+ characters/);
    expect(authErrorMessage(null, "login")).toMatch(/server/);
  });
});

describe("verifyErrorMessage", () => {
  it("maps server error codes and statuses to messages", () => {
    expect(verifyErrorMessage(400, "wrong_code")).toMatch(/isn't right/);
    expect(verifyErrorMessage(400, "code_expired")).toMatch(/new one/);
    expect(verifyErrorMessage(429)).toMatch(/Wait a minute/);
    expect(verifyErrorMessage(400)).toMatch(/6-digit/);
    expect(verifyErrorMessage(null)).toMatch(/server/);
  });
});
