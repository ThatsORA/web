import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCase, consensus, geminiAnswers, isHeldOut, teacherSchema, toRecord, type Scenario } from "./decision-data";

const jsonl = <T>(file: string): T[] =>
  readFileSync(join(import.meta.dirname, "decision-data", file), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as T);

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
    // A dropped question stays in `questions` (byte-identical to runtime) and is absent from `gold`.
    const row = toRecord(group, c, { propose: { choice: "A", probabilities: { A: 0.9, B: 0.1 } } });
    expect(JSON.parse(row.questions)).toEqual(c.questions);
    expect(JSON.parse(row.gold)).toEqual({ propose: { label: "A", probabilities: { A: 0.9, B: 0.1 } } });
  });

  it("averages the teachers, keeping agreement or a sure average", () => {
    const a = (A: number) => ({ choice: A >= 0.5 ? "A" : "B", probabilities: { A, B: 1 - A } });
    expect(consensus(["A", "B"], a(0.9), a(0.7))).toEqual({ choice: "A", probabilities: { A: 0.8, B: 0.2 } });
    expect(consensus(["A", "B"], a(0.95), a(0.4))).toEqual({ choice: "A", probabilities: { A: 0.675, B: 0.325 } });
    expect(consensus(["A", "B"], a(0.7), a(0.3))).toBeNull();
  });

  it("normalises Gemini's numbers and rejects a question with none", () => {
    const { questions } = buildCase(group);
    expect(teacherSchema(questions)).toMatchObject({ required: ["propose", "vibe"], properties: { vibe: { required: ["dinner", "night_out"] } } });
    expect(geminiAnswers({ propose: { A: 3, B: 1 }, vibe: { dinner: 0.2, night_out: 0.2 } }, questions)).toEqual({
      propose: { choice: "A", probabilities: { A: 0.75, B: 0.25 } },
      vibe: { choice: "dinner", probabilities: { dinner: 0.5, night_out: 0.5 } },
    });
    expect(() => geminiAnswers({ propose: { A: 0, B: 0 }, vibe: { dinner: 1, night_out: 0 } }, questions)).toThrow();
  });

  it("rebuilds every committed record byte-for-byte with the shared runtime builders", () => {
    const scenarios = new Map(jsonl<Scenario>("scenarios.jsonl").map((sc) => [sc.id, sc]));
    const rows = [...jsonl<{ id: string; state: string; questions: string }>("train.jsonl"), ...jsonl<{ id: string; state: string; questions: string }>("heldout.jsonl")];
    expect(rows.length).toBeGreaterThan(2000);
    for (const row of rows) {
      const c = buildCase(scenarios.get(row.id)!);
      expect([row.id, JSON.stringify(c.state), JSON.stringify(c.questions)]).toEqual([row.id, row.state, row.questions]);
    }
  });

  it("holds out every 10th scenario per kind", () => {
    expect([0, 1, 10, 1110, 1115].map((n) => isHeldOut(`v${String(n).padStart(5, "0")}`))).toEqual([true, false, true, true, false]);
  });
});
