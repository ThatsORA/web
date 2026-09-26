import { describe, expect, it } from "vitest";
import { formatCents, parseCents, remainingLine } from "./amounts";

describe("parseCents", () => {
  it("parses dollars and cents without floats", () => {
    expect(parseCents("12")).toBe(1200);
    expect(parseCents("12.5")).toBe(1250);
    expect(parseCents(" 0.07 ")).toBe(7);
    expect(parseCents("19.99")).toBe(1999);
  });
  it("rejects anything else", () => {
    for (const bad of ["", "abc", "1.234", "-5", "1,00", "."]) expect(parseCents(bad)).toBeNull();
  });
});

describe("remainingLine", () => {
  it("counts down to exactly zero", () => {
    expect(remainingLine(1000, [600])).toEqual({ text: "$4.00 left to assign", done: false });
    expect(remainingLine(1000, [600, 400])).toEqual({ text: "All assigned", done: true });
    expect(remainingLine(1000, [600, 401])).toEqual({ text: "Over by $0.01", done: false });
  });
  it("formats cents", () => {
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(123456)).toBe("$1234.56");
  });
});
