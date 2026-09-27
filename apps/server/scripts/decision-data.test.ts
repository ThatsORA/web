import { describe, expect, it } from "vitest";
import { buildCase, csvRow, isGold, toRecord, type Scenario } from "./decision-data";

const group: Scenario = {
  id: "g00001",
  kind: "group",
  size: 3,
  when: "Fri 7:00pm",
  last_hangout: "2 weeks ago",
  shared_favorites: ["sushi_restaurant"],
  feasible_vibes: ["dinner", "night_out"],
};

describe("decision-data", () => {
  it("builds propose + vibe questions, and skips vibe when only one is feasible", () => {
    expect(Object.keys(buildCase(group).questions)).toEqual(["propose", "vibe"]);
    expect(Object.keys(buildCase({ ...group, feasible_vibes: ["dinner"] }).questions)).toEqual(["propose"]);
  });

  it("writes rows in the Laya notebook shape (JSON-string state/questions/gold)", () => {
    const c = buildCase(group);
    const answers = {
      propose: { choice: "A", probabilities: { A: 0.9, B: 0.1 } },
      vibe: { choice: "dinner", probabilities: { dinner: 0.7, night_out: 0.3 } },
    };
    const row = toRecord(group, c, answers, 500);
    expect(JSON.parse(row.questions)).toEqual(c.questions);
    expect(JSON.parse(row.gold)).toEqual({
      propose: { label: "A", probabilities: { A: 0.9, B: 0.1 } },
      vibe: { label: "dinner", probabilities: { dinner: 0.7, night_out: 0.3 } },
    });
  });

  it("holds out every 15th scenario per kind, capped at 75", () => {
    expect([0, 1, 15, 1110, 1125].map((n) => isGold(`v${String(n).padStart(5, "0")}`))).toEqual([true, false, true, true, false]);
  });

  it("quotes CSV fields and doubles inner quotes", () => {
    expect(csvRow(['say "hi", ok', 3])).toBe('"say ""hi"", ok","3"');
  });
});
