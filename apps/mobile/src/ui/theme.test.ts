import { describe, expect, it } from "vitest";
import { themeFor, toneColors } from "./theme";

describe("themeFor", () => {
  it("returns the dark palette for dark", () => {
    expect(themeFor("dark").scheme).toBe("dark");
    expect(themeFor("dark").colors.background).not.toBe(themeFor("light").colors.background);
  });

  it("falls back to light for null, undefined and unknown values", () => {
    expect(themeFor(null).scheme).toBe("light");
    expect(themeFor(undefined).scheme).toBe("light");
    expect(themeFor("unspecified").scheme).toBe("light");
  });

  it("never paints text the same color as its background", () => {
    for (const s of ["light", "dark"]) {
      const { colors } = themeFor(s);
      expect(colors.text).not.toBe(colors.background);
      expect(colors.onPrimary).not.toBe(colors.primary);
    }
  });
});

describe("toneColors", () => {
  it("maps each tone to its palette pair", () => {
    const t = themeFor("light");
    expect(toneColors(t, "info")).toEqual({ fg: t.colors.info, bg: t.colors.infoSurface });
    expect(toneColors(t, "success")).toEqual({ fg: t.colors.success, bg: t.colors.successSurface });
    expect(toneColors(t, "danger")).toEqual({ fg: t.colors.danger, bg: t.colors.dangerSurface });
  });
});
