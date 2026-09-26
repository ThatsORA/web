import { describe, expect, it } from "vitest";
import { roundCoord, roundedHome } from "./geo";

describe("roundCoord", () => {
  it("rounds to 3 decimals", () => {
    expect(roundCoord(40.712776)).toBe(40.713);
    expect(roundCoord(-74.005974)).toBe(-74.006);
    expect(roundCoord(12.3)).toBe(12.3);
  });

  it("never returns -0", () => {
    expect(Object.is(roundCoord(-0.0001), 0)).toBe(true);
  });
});

describe("roundedHome", () => {
  it("maps device coords to the PATCH /me shape", () => {
    expect(roundedHome({ latitude: 40.712776, longitude: -74.005974 })).toEqual({
      home_lat: 40.713,
      home_lng: -74.006,
    });
  });
});
