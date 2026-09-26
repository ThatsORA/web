import { describe, expect, it } from "vitest";
import { FINDING_WINDOW_MS, feedEmptyState } from "./matcherTrigger";

const now = 1_000_000;

describe("feedEmptyState", () => {
  it("is empty when the matcher was never triggered", () => {
    expect(feedEmptyState(null, now, 0)).toBe("empty");
  });

  it("is finding when triggered 10 s ago", () => {
    expect(feedEmptyState(now - 10_000, now, 0)).toBe("finding");
  });

  it("is empty when triggered 60 s ago", () => {
    expect(feedEmptyState(now - 60_000, now, 0)).toBe("empty");
  });

  it("is empty exactly when the 45 s window ends", () => {
    expect(feedEmptyState(now - FINDING_WINDOW_MS, now, 0)).toBe("empty");
  });

  it("shows cards whenever a card is present, regardless of trigger", () => {
    expect(feedEmptyState(null, now, 1)).toBe("cards");
    expect(feedEmptyState(now - 10_000, now, 1)).toBe("cards");
    expect(feedEmptyState(now - 60_000, now, 2)).toBe("cards");
  });

  it("treats a trigger newer than a stale now as just triggered", () => {
    expect(feedEmptyState(now + 500, now, 0)).toBe("finding");
  });
});
