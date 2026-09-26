import { describe, expect, it } from "vitest";
import { candidateGroups, groupKey, onCooldown, rankCandidates, selectCandidates, selectRankedCandidates, type MatchingFriendship, type MatchingEvent, type GroupSlot } from "./candidates";
const now = new Date("2026-09-26T12:00:00Z");
const hour = 3_600_000;
const at = (hours: number) => new Date(now.getTime() + hours * hour);
const users = (ids: string[]) => ids.map(id => ({ id, timezone: "America/New_York" }));
const edge = (a: string, b: string, score = 0.5, lastHangoutAt: Date | null = null): MatchingFriendship => ({ userLowId: a, userHighId: b, lowAddedHigh: true, highAddedLow: true, interactionScore: score, lastHangoutAt });
const clique = (ids: string[]) => ids.flatMap((a, i) => ids.slice(i + 1).map(b => edge(a, b)));
const explicit = (ids: string[], id = "squad") => ({ id, members: ids.map(userId => ({ userId })) });
function candidate(ids: string[], start = 24, end = start + 2): GroupSlot {
  return {
    group: {
      groupKey: groupKey(ids),
      memberIds: ids,
      memberTimezones: Object.fromEntries(ids.map(id => [id, "America/New_York"])),
      sourceGroupId: null,
    },
    slot: { start: at(start), end: at(end), vibe_tag: "dinner", durationMinutes: (end - start) * 60 },
  };
}
function event(ids: string[], status: MatchingEvent["status"] = "voting", start = 24, end = 26): MatchingEvent {
  return { groupKey: groupKey(ids), status, startsAt: at(start), endsAt: at(end), resolvedAt: at(-1), participants: ids.map(userId => ({ userId })) };
}
describe("candidate groups", () => {
  it("forms every mutual pair plus a maximal triangle, but never a one-way pair", () => {
    const ids = ["a", "b", "c"];
    expect(candidateGroups(users(ids), clique(ids)).map(g => g.groupKey)).toEqual(["a,b", "a,b,c", "a,c", "b,c"]);
    expect(candidateGroups(users(ids), [edge("a", "b"), edge("b", "c")]).map(g => g.groupKey)).toEqual(["a,b", "b,c"]);
    expect(candidateGroups(users(ids), [{ ...edge("a", "b"), highAddedLow: false }])).toEqual([]);
  });
  it("deduplicates explicit groups, maximal cliques and one-drop subsets with stable provenance", () => {
    const ids = ["a", "b", "c", "d"];
    const result = candidateGroups(users(ids), clique(ids), [explicit([...ids].reverse(), "z"), explicit(ids, "a")]);
    expect(result).toHaveLength(11);
    expect(result.filter(g => g.memberIds.length >= 3).every(g => g.sourceGroupId === "a")).toBe(true);
    expect(result.map(g => g.memberIds.length).sort()).toEqual([2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4]);
    expect(candidateGroups(users(ids).reverse(), clique(ids).reverse(), [explicit(ids, "a"), explicit(ids, "z")])).toEqual(result);
  });
  it("finds overlapping maximal cliques without losing either", () => {
    const result = candidateGroups(users(["a", "b", "c", "d"]), [...clique(["a", "b", "c"]), edge("b", "d"), edge("c", "d")]);
    expect(result.filter(g => g.memberIds.length === 3).map(g => g.groupKey)).toEqual(["a,b,c", "b,c,d"]);
  });
  it("keeps known members across timezones and does not turn explicit two-member groups into friend pairs", () => {
    const ids = ["a", "b", "c"];
    const result = candidateGroups([...users(["a", "b"]), { id: "c", timezone: "Europe/London" }], clique(ids));
    expect(result.map(g => g.groupKey)).toEqual(["a,b", "a,b,c", "a,c", "b,c"]);
    expect(result.find(g => g.groupKey === "a,b,c")?.memberTimezones).toEqual({
      a: "America/New_York",
      b: "America/New_York",
      c: "Europe/London",
    });
    expect(candidateGroups(users(["a", "b"]), [], [explicit(ids), explicit(["a", "b"])])).toEqual([]);
    expect(candidateGroups([], [])).toEqual([]);
  });
  it("keeps only 3–6 members and generates exactly one level of subsets", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const seven = candidateGroups(users(ids), clique(ids)).filter(g => g.memberIds.length >= 3);
    expect(seven).toHaveLength(7);
    expect(seven.every(g => g.memberIds.length === 6)).toBe(true);
    const six = candidateGroups(users(ids.slice(0, 6)), clique(ids.slice(0, 6))).filter(g => g.memberIds.length >= 3);
    expect(six).toHaveLength(7);
    expect(six.every(g => g.memberIds.length >= 5)).toBe(true);
  });
});
describe("ranking and cooldown", () => {
  it("computes the numeric example: .4*.6 + .35*.5 + .25*.5 = .54", () => {
    const pairs = [edge("a", "b", .3, at(-7 * 24)), edge("a", "c", .6, at(-10 * 24)), edge("b", "c", .9)];
    const ranked = rankCandidates([candidate(["a", "b", "c"], 84)], pairs, now)[0]!;
    expect(ranked.closeness).toBeCloseTo(.6);
    expect(ranked.staleness).toBe(.5);
    expect(ranked.soonness).toBe(.5);
    expect(ranked.score).toBeCloseTo(.54);
  });
  it("uses staleness 1 for never/14+ days and includes missing pairs as zero", () => {
    const c = candidate(["a", "b", "c"]);
    expect(rankCandidates([c], [], now)[0]?.staleness).toBe(1);
    const ranked = rankCandidates([c], [edge("a", "b", .6, at(-20 * 24))], now)[0]!;
    expect(ranked.staleness).toBe(1);
    expect(ranked.closeness).toBeCloseTo(.2);
  });
  it("breaks score ties by earlier start, then lexical group key", () => {
    const a = candidate(["a", "b", "c"], 0);
    const b = candidate(["d", "e", "f"], 168);
    // .4*0 + .35 + .25 = .4*.625 + .35 + 0 = .6
    const pairs = clique(b.group.memberIds).map(e => ({ ...e, interactionScore: .625 }));
    expect(rankCandidates([b, a], pairs, now).map(c => c.group.groupKey)).toEqual(["a,b,c", "d,e,f"]);
    expect(rankCandidates([candidate(["d", "e", "f"]), candidate(["a", "b", "c"])], [], now).map(c => c.group.groupKey)).toEqual(["a,b,c", "d,e,f"]);
  });
  it("ranks a pair below a 3-person group when their base scores are equal", () => {
    const pair = candidate(["d", "e"]);
    const group = candidate(["a", "b", "c"]);
    const ranked = rankCandidates([pair, group], [...clique(group.group.memberIds), edge("d", "e")], now);
    expect(ranked.map(c => c.group.groupKey)).toEqual(["a,b,c", "d,e"]);
    expect(ranked[1]!.score).toBeCloseTo(ranked[0]!.score * 0.85);
  });
  it.each(["expired", "chatted"] as const)("uses %s resolution for cooldown with an exact boundary and demo disable", status => {
    const e = event(["a", "b", "c"], status);
    expect(onCooldown(e.groupKey, [e], now, 2)).toBe(true);
    expect(onCooldown(e.groupKey, [e], at(1), 2)).toBe(false);
    expect(onCooldown(e.groupKey, [e], now, 0)).toBe(false);
    expect(onCooldown(e.groupKey, [{ ...e, resolvedAt: null }], now, 2)).toBe(false);
    expect(onCooldown("other", [e], now, 2)).toBe(false);
  });
  it("does not cool down completed events", () => {
    const e = event(["a", "b", "c"], "completed");
    expect(onCooldown(e.groupKey, [e], now, 48)).toBe(false);
  });
  it("applies cooldown to a mutual pair's group key", () => {
    const pair = event(["a", "b"], "expired");
    expect(onCooldown("a,b", [pair], now, 48)).toBe(true);
  });
});
describe("greedy selection", () => {
  it.each(["voting", "confirmed"] as const)("blocks the same group regardless of time, and overlapping members in %s events", status => {
    const c = candidate(["a", "b", "c"]);
    expect(selectCandidates([c], [], [event(c.group.memberIds, status, 40, 42)], now)).toEqual([]);
    expect(selectCandidates([c], [], [event(["c", "d", "e"], status, 25, 27)], now)).toEqual([]);
  });
  it("allows abutting slots, disjoint members and closed events", () => {
    const c = candidate(["a", "b", "c"]);
    for (const e of [event(["c", "d", "e"], "voting", 26, 28), event(["d", "e", "f"]), event(c.group.memberIds, "completed")]) {
      expect(selectCandidates([c], [], [e], now)).toHaveLength(1);
    }
  });
  it("reserves selected members and groups and applies cooldown", () => {
    const a = candidate(["a", "b", "c"]);
    const overlap = candidate(["c", "d", "e"]);
    const later = candidate(["c", "d", "e"], 26);
    const duplicate = candidate(["a", "b", "c"], 40);
    const inputs = [duplicate, later, overlap, a];
    expect(selectCandidates(inputs, [], [], now).map(c => c.slot.start)).toEqual([at(24), at(26)]);
    expect(inputs[0]).toBe(duplicate);
    expect(selectCandidates([a], [], [event(a.group.memberIds, "expired")], now, 48)).toEqual([]);
  });
  it("applies greedy skip rules in the supplied re-ranked order", () => {
    const first = candidate(["a", "b", "c"]);
    const overlap = candidate(["c", "d", "e"]);
    const ranked = rankCandidates([first, overlap], [], now);

    expect(selectRankedCandidates([...ranked].reverse(), [], now).map(item => item.group.groupKey))
      .toEqual(["c,d,e"]);
  });
  it("suppresses a pair while either member has an overlapping open group event", () => {
    const pair = candidate(["a", "b"]);
    expect(selectCandidates([pair], [edge("a", "b")], [event(["b", "c", "d"], "voting", 25, 27)], now)).toEqual([]);
  });
});
