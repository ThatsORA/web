import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VibeTag } from "@web/contract";
import type { DecisionResponse } from "./decision";

const askDecision = vi.hoisted(() => vi.fn());
vi.mock("./decision", async (importOriginal) => ({
  ...await importOriginal<typeof import("./decision")>(),
  askDecision,
}));

import { feasibleSlots, classifySlot } from "../matching/timeMath";
import { buildCase, type Scenario } from "../../../scripts/decision-data";
import { applyDecisions, decisionRequest, scheduleDecisions, type DecisionCandidate } from "./scheduleDecisions";

const IDS = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const TZ = "America/New_York";
// Fri Oct 2 2026, 17:00–23:30 EDT: dinner, casual_hangout and night_out all fit; night_out is the priority pick.
const WIDE = { start: new Date("2026-10-02T21:00:00Z"), end: new Date("2026-10-03T03:30:00Z") };
// Thu Oct 1 2026, 17:00–18:15 EDT: only casual_hangout fits.
const NARROW = { start: new Date("2026-10-01T21:00:00Z"), end: new Date("2026-10-01T22:15:00Z") };

function candidate(key: string, window: { start: Date; end: Date }, daysSinceLastHangout: number | null = null): DecisionCandidate {
  return {
    group: { groupKey: key, memberIds: IDS, memberTimezones: Object.fromEntries(IDS.map((id) => [id, TZ])), sourceGroupId: null },
    slot: classifySlot(window, TZ)!,
    feasible: feasibleSlots(window, TZ),
    daysSinceLastHangout,
    staleness: 1,
    soonness: 0.5,
    score: 0.7,
  };
}

function reply(answers: Record<string, { choice: string; probabilities: Record<string, number> }>): DecisionResponse {
  return {
    model: "jev-1.13.0",
    answers: Object.fromEntries(Object.entries(answers).map(([id, a]) => [id, { type: "choice", confidence: 0.9, ...a }])),
  };
}
const propose = (pA: number) => ({ choice: pA >= 0.5 ? "A" : "B", probabilities: { A: pA, B: 1 - pA } });
const vibe = (v: VibeTag) => ({ choice: v, probabilities: { [v]: 1 } });

beforeEach(() => {
  askDecision.mockReset();
});

describe("decisionRequest", () => {
  const facts = (c: DecisionCandidate, favorites: Parameters<typeof decisionRequest>[1] = new Map()) =>
    (decisionRequest(c, favorites).questions.propose!.instructions as { facts: string[] }).facts;

  it("is byte-identical to the training request for the same scenario (#235)", () => {
    const favorites = new Map([
      [IDS[0]!, [{ category: "coffee_shop" }, { category: "coffee_shop" }]],
      [IDS[1]!, [{ category: "coffee_shop" }, { category: "bar" }]],
      [IDS[2]!, [{ category: "restaurant" }]],
    ]);
    const scenario: Scenario = {
      id: "g00000",
      kind: "group",
      size: 3,
      when: "Fri 7:00pm",
      last_hangout: "2 weeks ago",
      shared_favorites: ["coffee_shop"],
      feasible_vibes: ["casual_hangout", "dinner", "night_out"],
    };
    expect(JSON.stringify(decisionRequest(candidate("g", WIDE, 20), favorites))).toBe(JSON.stringify(buildCase(scenario)));
    const narrow = { ...scenario, when: "Thu 5:00pm", last_hangout: "never", shared_favorites: [], feasible_vibes: ["casual_hangout" as const] };
    expect(JSON.stringify(decisionRequest(candidate("n", NARROW), new Map()))).toBe(JSON.stringify(buildCase(narrow)));
  });

  it("phrases the last hangout like the training scenarios", () => {
    const last = (days: number | null) => facts(candidate("g", WIDE, days))[2];
    expect([null, 0.5, 1.2, 6, 13.9, 14, 59, 60, 95].map(last)).toEqual([
      "never", "today", "yesterday", "6 days ago", "13 days ago", "2 weeks ago", "8 weeks ago", "2 months ago", "3 months ago",
    ].map((t) => `Last hangout: ${t}`));
  });

  it("leaks no ids or raw timestamps", () => {
    const text = JSON.stringify(decisionRequest(candidate("g", WIDE, 20), new Map()));
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}|T\d{2}:\d{2}/);
    for (const id of IDS) expect(text).not.toContain(id);
  });
});

describe("applyDecisions", () => {
  const wide = candidate("wide", WIDE);
  const narrow = candidate("narrow", NARROW);

  it("keeps candidates at P(A) ≥ 0.6 and drops those below", () => {
    const kept = applyDecisions([wide, narrow], [reply({ propose: propose(0.6) }), reply({ propose: propose(0.59) })], false);
    expect(kept.map((c) => c.group.groupKey)).toEqual(["wide"]);
  });

  it("uses the chosen vibe's slot", () => {
    const [kept] = applyDecisions([wide], [reply({ propose: propose(0.9), vibe: vibe("dinner") })], false);
    expect(kept!.slot).toEqual(wide.feasible.find((s) => s.vibe_tag === "dinner"));
    expect(kept!.slot.vibe_tag).not.toBe(wide.slot.vibe_tag);
  });

  it("keeps the priority slot when no vibe question was asked", () => {
    const [kept] = applyDecisions([narrow], [reply({ propose: propose(0.9) })], false);
    expect(kept!.slot).toEqual(narrow.slot);
  });

  it("skips the gate when forced but still applies the chosen vibe", () => {
    const kept = applyDecisions([wide, narrow], [reply({ propose: propose(0.1), vibe: vibe("casual_hangout") }), reply({ propose: propose(0) })], true);
    expect(kept.map((c) => [c.group.groupKey, c.slot.vibe_tag])).toEqual([["wide", "casual_hangout"], ["narrow", "casual_hangout"]]);
  });
});

describe("scheduleDecisions", () => {
  it("sends one request per candidate and applies each reply to its candidate", async () => {
    askDecision
      .mockResolvedValueOnce(reply({ propose: propose(0.2), vibe: vibe("dinner") }))
      .mockResolvedValueOnce(reply({ propose: propose(0.8) }));
    const wide = candidate("wide", WIDE);
    const narrow = candidate("narrow", NARROW);
    const kept = await scheduleDecisions([wide, narrow], new Map(), false);
    expect(askDecision.mock.calls).toEqual([[decisionRequest(wide, new Map())], [decisionRequest(narrow, new Map())]]);
    expect(kept.map((c) => c.group.groupKey)).toEqual(["narrow"]);
  });

  it("falls back to the top-ranked candidate with its priority vibe when any call fails", async () => {
    askDecision
      .mockResolvedValueOnce(reply({ propose: propose(0.9) }))
      .mockRejectedValueOnce(new Error("Decision: no provider configured"));
    const wide = candidate("wide", WIDE);
    const kept = await scheduleDecisions([wide, candidate("narrow", NARROW)], new Map(), true);
    expect(kept).toEqual([wide]);
    expect(kept[0]!.slot.vibe_tag).toBe("night_out");
  });

  it("skips the call when there is nothing to decide", async () => {
    expect(await scheduleDecisions([], new Map(), false)).toEqual([]);
    expect(askDecision).not.toHaveBeenCalled();
  });
});
