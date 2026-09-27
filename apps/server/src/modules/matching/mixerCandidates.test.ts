import { describe, expect, it } from "vitest";
import type { MatchingEvent, MatchingFriendship } from "./candidates";
import { mixerCandidates } from "./mixerCandidates";

const now = new Date("2026-10-01T12:00:00Z");
const users = (ids: string[]) => ids.map((id) => ({ id, timezone: "America/New_York" }));
const friend = (a: string, b: string, score = 0.8): MatchingFriendship => ({
  userLowId: a, userHighId: b, status: "accepted", lowAddedHigh: true, highAddedLow: true,
  interactionScore: score, lastHangoutAt: null,
});
const event = (ids: string[], status: MatchingEvent["status"], resolvedAt: Date | null = null): MatchingEvent => ({
  groupKey: ids.join(","), status, resolvedAt,
  startsAt: new Date("2026-10-03T18:00:00Z"), endsAt: new Date("2026-10-03T20:00:00Z"),
  participants: ids.map((userId) => ({ userId })),
});

describe("mixerCandidates", () => {
  it("finds connected 4–6 person groups through mutual friends without a human creator", () => {
    const edges = [friend("a", "b"), friend("a", "c"), friend("a", "d"), friend("a", "e"), friend("a", "f")];
    const result = mixerCandidates(users(["a", "b", "c", "d", "e", "f"]), edges, [], now);
    expect(result.some((candidate) => candidate.group.groupKey === "a,b,c,d,e,f")).toBe(true);
    expect(result.every((candidate) => candidate.group.memberIds.length >= 4 && candidate.group.memberIds.length <= 6)).toBe(true);
    expect(result.every((candidate) => candidate.group.sourceGroupId === null)).toBe(true);
    expect(new Set(result.map((candidate) => candidate.group.groupKey)).size).toBe(result.length);
  });

  it("rejects disconnected groups and friendships that are pending or not mutual", () => {
    const edges = [friend("a", "b"), friend("b", "c"),
      { ...friend("c", "d"), status: "pending" },
      { ...friend("a", "d"), highAddedLow: false }];
    expect(mixerCandidates(users(["a", "b", "c", "d"]), edges, [], now)).toEqual([]);
  });

  it("ranks stronger interactions ahead of weaker connected groups", () => {
    const strong = [friend("a", "b", 1), friend("a", "c", 1), friend("a", "d", 1)];
    const weak = [friend("w", "x", 0.2), friend("w", "y", 0.2), friend("w", "z", 0.2)];
    const result = mixerCandidates(users(["a", "b", "c", "d", "w", "x", "y", "z"]), [...strong, ...weak], [], now);
    expect(result.map((candidate) => candidate.group.groupKey)).toEqual(["a,b,c,d", "w,x,y,z"]);
    expect(result[0]!.score).toBeGreaterThan(result[1]!.score);
  });

  it("respects a per-person open-event limit and the group cooldown", () => {
    const edges = [friend("a", "b"), friend("a", "c"), friend("a", "d")];
    const people = users(["a", "b", "c", "d"]);
    expect(mixerCandidates(people, edges, [event(["a", "x"], "voting")], now)).toEqual([]);
    expect(mixerCandidates(people, edges, [event(["a", "b", "c", "d"], "expired", now)], now)).toEqual([]);
    expect(mixerCandidates(people, edges, [event(["a", "b", "c", "d"], "expired", new Date("2026-09-28T12:00:00Z"))], now)).toHaveLength(1);
  });

  it("excludes a four-person chain whose ends are more than two friendship hops apart", () => {
    expect(mixerCandidates(users(["a", "b", "c", "d"]),
      [friend("a", "b"), friend("b", "c"), friend("c", "d")], [], now)).toEqual([]);
  });
});
