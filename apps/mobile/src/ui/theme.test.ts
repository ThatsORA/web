import { describe, expect, it } from "vitest";
import { contrastRatio, TEXT_PAIRS, themeFor, toneColors, type } from "./theme";

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

  it("keeps the brand violet identical in both schemes", () => {
    expect(themeFor("light").colors.primary).toBe("#6A00F4");
    expect(themeFor("dark").colors.primary).toBe("#6A00F4");
  });
});

describe("contrastRatio", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrastRatio("#FFFFFF", "#6A00F4")).toBeCloseTo(7.19, 1);
  });
});

describe("accessibility", () => {
  for (const scheme of ["light", "dark"] as const) {
    const { colors } = themeFor(scheme);
    for (const [fg, bg] of TEXT_PAIRS) {
      it(`${scheme}: ${fg} on ${bg} is at least 4.5:1`, () => {
        expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("lime text is always dark (onLime), even in dark mode", () => {
    expect(themeFor("dark").colors.onLime).toBe(themeFor("light").colors.onLime);
  });
});

describe("shape and type", () => {
  it("uses exact 1px corners on components", () => {
    const { radius } = themeFor("light");
    expect(radius.sm).toBe(1);
    expect(radius.md).toBe(1);
  });

  it("gives every text preset a line height taller than its size", () => {
    for (const preset of Object.values(type)) {
      expect(preset.lineHeight).toBeGreaterThan(preset.fontSize);
    }
  });
});

describe("toneColors", () => {
  it("maps each tone to its palette pair", () => {
    const t = themeFor("light");
    expect(toneColors(t, "info")).toEqual({ fg: t.colors.info, bg: t.colors.infoSurface });
    expect(toneColors(t, "success")).toEqual({ fg: t.colors.success, bg: t.colors.successSurface });
    expect(toneColors(t, "warning")).toEqual({ fg: t.colors.warning, bg: t.colors.warningSurface });
    expect(toneColors(t, "danger")).toEqual({ fg: t.colors.danger, bg: t.colors.dangerSurface });
  });
});
