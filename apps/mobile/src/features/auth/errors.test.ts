import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./errors";

describe("authErrorMessage", () => {
  it("maps server statuses to messages", () => {
    expect(authErrorMessage(409, "signup")).toMatch(/taken/);
    expect(authErrorMessage(401, "login")).toMatch(/Wrong email or password/);
    expect(authErrorMessage(400, "signup")).toMatch(/8\+ characters/);
    expect(authErrorMessage(null, "login")).toMatch(/server/);
  });
});
