import { describe, expect, it } from "vitest";
import { displayName } from "./displayName";

describe("displayName", () => {
  it("uses the display name when it's set", () => {
    expect(displayName({ username: "riley", display_name: "Riley Chen" })).toBe("Riley Chen");
  });

  it("falls back to the username for an existing user who never set a name (Me.display_name is null)", () => {
    expect(displayName({ username: "ojas", display_name: null })).toBe("ojas");
  });

  it("falls back to the username when the payload has no display name (chat messages)", () => {
    expect(displayName({ username: "presenter" })).toBe("presenter");
  });

  it("never shows a blank label", () => {
    expect(displayName({ username: "andy", display_name: "   " })).toBe("andy");
  });
});
