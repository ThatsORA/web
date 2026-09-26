import { describe, expect, it } from "vitest";
import { profileHref } from "./routes";

describe("profileHref", () => {
  it("points at the user/[userId] route with the id as a param", () => {
    expect(profileHref("abc")).toEqual({ pathname: "/(main)/user/[userId]", params: { userId: "abc" } });
  });
});
