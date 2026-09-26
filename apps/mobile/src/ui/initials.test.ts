import { describe, expect, it } from "vitest";
import { initials } from "./initials";

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("  mary  jane watson ")).toBe("MJ");
  });

  it("uses one letter for a single word, like a username", () => {
    expect(initials("ada_l")).toBe("A");
  });
});
