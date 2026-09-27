import { describe, expect, it } from "vitest";
import { FIND_NOW_TIMEOUT_MS, findNowState } from "./findNow";

const now = 1_000_000;

describe("findNowState", () => {
  it("is idle before any tap", () => {
    expect(findNowState(null, now, ["a"])).toBe("idle");
  });

  it("is finding right after a tap while only the old cards are on the feed", () => {
    expect(findNowState({ at: now - 10_000, cardIds: ["a"] }, now, ["a"])).toBe("finding");
    expect(findNowState({ at: now - 10_000, cardIds: [] }, now, [])).toBe("finding");
  });

  it("is idle as soon as a card that wasn't there at tap time arrives", () => {
    expect(findNowState({ at: now - 10_000, cardIds: ["a"] }, now, ["a", "b"])).toBe("idle");
    expect(findNowState({ at: now - 90_000, cardIds: [] }, now, ["b"])).toBe("idle");
  });

  it("times out exactly when the window ends with nothing new", () => {
    expect(findNowState({ at: now - FIND_NOW_TIMEOUT_MS, cardIds: ["a"] }, now, ["a"])).toBe("timedOut");
  });

  it("stays finding when an old card is removed", () => {
    expect(findNowState({ at: now - 10_000, cardIds: ["a", "b"] }, now, ["a"])).toBe("finding");
  });

  it("treats a tap newer than a stale now as just tapped", () => {
    expect(findNowState({ at: now + 500, cardIds: [] }, now, [])).toBe("finding");
  });
});
