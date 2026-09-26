import { describe, expect, it } from "vitest";
import { initials } from "./initials";

describe("initials", () => {
  it("takes the first letter of up to two words, uppercased", () => {
    expect(initials("Andy Do")).toBe("AD");
    expect(initials("riley h six")).toBe("RH");
    expect(initials("andy_do")).toBe("A");
  });

  it("ignores extra whitespace and keeps code points whole", () => {
    expect(initials("  Émile   Zola ")).toBe("ÉZ");
    expect(initials("🎸 Band")).toBe("🎸B");
  });

  it("falls back to ? for an empty name", () => {
    expect(initials("   ")).toBe("?");
  });
});
