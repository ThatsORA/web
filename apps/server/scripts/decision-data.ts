// Owner: Ojas — Laya training data (#235, #274). Gemini writes synthetic scenarios; two teachers, Jev and
// Gemini, answer every question through the same request builders runtime uses; the training target is
// their average. Output is the Laya notebook's format (LocalLLaMA/typed-decisions).
// Run: pnpm --filter @web/server decision-data [totalScenarios]   (needs GEMINI_API_KEY + JEV_API_KEY)
//      pnpm --filter @web/server decision-data eval               (held-out table; also Laya when LAYA_URL is set)
// Resumable: scenarios and each teacher's answers append to scripts/decision-data/ and skip ids already
// done; train.jsonl and heldout.jsonl are rebuilt from them on every run.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { VibeTag } from "@web/contract";
import { env } from "../src/env";
import {
  callProvider,
  groupRequest,
  LAYA_MODEL,
  parseDecision,
  venueFitRequest,
  type DecisionQuestions,
  type DecisionRequest,
} from "../src/modules/intelligence/decision";

const OUT = join(import.meta.dirname, "decision-data");
const SCENARIOS = join(OUT, "scenarios.jsonl"); // every Gemini scenario, append-only
const JEV = join(OUT, "jev.jsonl"); // Jev's answers, one row per scenario, append-only
const GEMINI = join(OUT, "gemini.jsonl"); // Gemini's answers, one row per scenario, append-only
const TRAIN = join(OUT, "train.jsonl"); // rebuilt: teacher consensus, notebook format
const HELDOUT = join(OUT, "heldout.jsonl"); // rebuilt: the same for held-out scenarios

const GEMINI_MODEL = "gemini-3.8-flash";
const JEV_MODEL = "jev-1.13.0";
const BATCH = 25;
const HELDOUT_EVERY = 10; // every 10th scenario of a kind is held out (~10%), so it spans every batch theme
const KEEP_TOP = 0.6; // keep a question the teachers disagree on only when their averaged top answer is this sure

// ---------- scenarios ----------

const GroupScenario = z.object({
  size: z.number().int().min(2).max(6),
  when: z.string().min(3).max(40),
  last_hangout: z.string().min(2).max(40),
  shared_favorites: z.array(z.string()).max(4),
  feasible_vibes: z.array(VibeTag).min(1).max(4),
});
const VenueScenario = z.object({
  name: z.string().min(2).max(60),
  primary_type: z.string().min(2).max(40),
  price_level: z.number().int().min(1).max(4).nullable(),
  rating: z.number().min(1).max(5).nullable(),
  reviews: z.array(z.string().max(220)).max(3),
  vibe: VibeTag,
});
type Kind = "group" | "venue";
export type Scenario =
  | ({ id: string; kind: "group" } & z.infer<typeof GroupScenario>)
  | ({ id: string; kind: "venue" } & z.infer<typeof VenueScenario>);

const VIBES = VibeTag.options;
const FAVORITES = ["coffee_shop", "mexican_restaurant", "restaurant", "sushi_restaurant", "pizza_restaurant", "bar", "tea_house", "dessert_shop"];

const GROUP_THEMES = [
  "clear yes cases: a long gap since the last hangout and a good evening or weekend slot",
  "hard negatives: they hung out very recently (yesterday, 2 days ago), or the slot is awkward (Mon 6:30am, Wed 11:45pm, a 20-minute gap)",
  "borderline cases where reasonable people could disagree (about a week since the last hangout, a weekday lunch, a big group at an odd time)",
  "vibe-focused cases: several feasible vibes, where the time of day and shared favorites point to one of them (or conflict)",
  "a natural mix of everything above",
];
const VENUE_THEMES = [
  "clear fits (a well-rated cafe for quick coffee, a lively bar for a night out)",
  "clear misfits: the wrong kind of place (a gym, laundromat, gas station or hardware store for dinner; a steakhouse for a quick coffee; a night club for coffee)",
  "hard negatives: the type looks right but reviews, price or rating say otherwise (a 'cafe' reviewed as a loud club, a $$$$ tasting menu for a casual hangout, a 1.9-rated bar, a coffee shop that closes at noon for a night out)",
  "borderline cases where reasonable people could disagree (a brewery for dinner, a bakery for a casual hangout, a hotel lounge for a night out, missing price or rating)",
  "a natural mix of everything above",
];

export function groupPrompt(n: number, theme: string): string {
  return [
    `Write ${n} varied, realistic, synthetic scenarios for a friend-hangout app. The app decides whether to suggest a hangout to a friend group now, and which kind of hangout.`,
    "Use plain words only. Never use people's names.",
    "Fields:",
    "- size: how many friends are in the group, 2 to 6.",
    '- when: the group\'s shared free time as a short local day and time, like "Fri 7:00pm", "Sat 11:30am" or "Tue 12:15pm". Vary the days and times widely.',
    '- last_hangout: how long since this group last hung out, like "yesterday", "5 days ago", "over 2 weeks ago", "2 months ago" or "never".',
    `- shared_favorites: 0 to 3 place categories every member likes, from: ${FAVORITES.join(", ")}.`,
    `- feasible_vibes: the kinds of hangout that fit the free time, 1 to 4 of: ${VIBES.join(", ")}. quick_coffee is daytime and short, casual_hangout is 1-2 hours in the day or early evening, dinner is evening, night_out is late evening. Most scenarios should have 2 or more.`,
    `Focus for this batch: ${theme}.`,
    `Batch seed ${Math.random().toString(36).slice(2, 8)}: make these different from typical examples.`,
  ].join("\n");
}

export function venuePrompt(n: number, theme: string): string {
  return [
    `Write ${n} varied, realistic, synthetic (venue, hangout) pairs for a friend-hangout app that decides whether a venue fits a planned hangout.`,
    "Invent realistic-sounding local business names; never use real chains or people's names.",
    "Fields:",
    "- name: the venue's name.",
    "- primary_type: a Google Places type in snake_case (e.g. coffee_shop, cafe, bakery, bar, night_club, bowling_alley, steak_house, fine_dining_restaurant, fast_food_restaurant, ramen_restaurant, brewery, gym, laundromat, gas_station, museum, park, library, karaoke). Vary them widely.",
    "- price_level: 1 to 4 ($ to $$$$), or null if unknown.",
    "- rating: 1.0 to 5.0, or null if unknown.",
    "- reviews: 0 to 3 short review snippets (under 200 characters each) in the style of online reviews.",
    `- vibe: the planned hangout, one of ${VIBES.join(", ")} (quick_coffee: under an hour in the day; casual_hangout: 1-2 relaxed hours; dinner: a sit-down evening meal; night_out: 2-3 hours at a bar, club or bowling alley).`,
    `Focus for this batch: ${theme}.`,
    `Batch seed ${Math.random().toString(36).slice(2, 8)}: make these different from typical examples.`,
  ].join("\n");
}

const STR = { type: "STRING" };
const RESPONSE_SCHEMA: Record<Kind, object> = {
  group: {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        size: { type: "INTEGER" },
        when: STR,
        last_hangout: STR,
        shared_favorites: { type: "ARRAY", items: { type: "STRING", enum: FAVORITES } },
        feasible_vibes: { type: "ARRAY", items: { type: "STRING", enum: VIBES } },
      },
      required: ["size", "when", "last_hangout", "shared_favorites", "feasible_vibes"],
    },
  },
  venue: {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        name: STR,
        primary_type: STR,
        price_level: { type: "INTEGER", nullable: true },
        rating: { type: "NUMBER", nullable: true },
        reviews: { type: "ARRAY", items: STR },
        vibe: { type: "STRING", enum: VIBES },
      },
      required: ["name", "primary_type", "price_level", "rating", "reviews", "vibe"],
    },
  },
};

const usage = { geminiIn: 0, geminiOut: 0, jevIn: 0, jevOut: 0 };

async function withRetry<T>(what: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= 5) throw e;
      const wait = 1000 * 2 ** attempt + Math.random() * 500;
      console.warn(`${what}: ${(e as Error).message}; retry in ${Math.round(wait)}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function geminiJson(prompt: string, responseSchema: object, temperature: number, thinkingLevel?: "low"): Promise<unknown> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema, temperature, ...(thinkingLevel && { thinkingConfig: { thinkingLevel } }) },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}`);
  const body = (await r.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  };
  usage.geminiIn += body.usageMetadata?.promptTokenCount ?? 0;
  usage.geminiOut += (body.usageMetadata?.candidatesTokenCount ?? 0) + (body.usageMetadata?.thoughtsTokenCount ?? 0);
  return JSON.parse(body.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
}

/** Content key for de-duplication (ignores the id). */
export function scenarioKey(s: Record<string, unknown>): string {
  const { id: _id, kind: _kind, ...rest } = s;
  return JSON.stringify(rest).toLowerCase();
}

function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as T);
}

async function generateScenarios(targets: Record<Kind, number>) {
  const all = readJsonl<Scenario>(SCENARIOS);
  const seen = new Set(all.map((s) => scenarioKey(s)));
  const count = { group: all.filter((s) => s.kind === "group").length, venue: all.filter((s) => s.kind === "venue").length };
  let batchNo = all.length;
  while (count.group < targets.group || count.venue < targets.venue) {
    const jobs: { kind: Kind; n: number; theme: string }[] = [];
    for (const kind of ["group", "venue"] as const) {
      const themes = kind === "group" ? GROUP_THEMES : VENUE_THEMES;
      let need = targets[kind] - count[kind];
      for (let k = 0; need > 0 && k < 4; k++) {
        const n = Math.min(BATCH, need);
        jobs.push({ kind, n, theme: themes[batchNo++ % themes.length]! });
        need -= n;
      }
    }
    const before = count.group + count.venue;
    const results = await Promise.allSettled(
      jobs.map((j) => withRetry(`Gemini ${j.kind}`, async () =>
        z.array(z.unknown()).parse(await geminiJson((j.kind === "group" ? groupPrompt : venuePrompt)(j.n, j.theme), RESPONSE_SCHEMA[j.kind], 1.0)))),
    );
    results.forEach((res, i) => {
      const kind = jobs[i]!.kind;
      if (res.status === "rejected") return console.warn(`Gemini ${kind} batch failed: ${res.reason}`);
      for (const raw of res.value) {
        const parsed = (kind === "group" ? GroupScenario : VenueScenario).safeParse(raw);
        if (!parsed.success || count[kind] >= targets[kind]) continue;
        const data = parsed.data as Record<string, unknown>;
        if ("feasible_vibes" in data) data.feasible_vibes = [...new Set(data.feasible_vibes as string[])];
        const key = scenarioKey(data);
        if (seen.has(key)) continue;
        seen.add(key);
        const s = { id: `${kind[0]}${String(count[kind]++).padStart(5, "0")}`, kind, ...data } as Scenario;
        appendFileSync(SCENARIOS, JSON.stringify(s) + "\n");
      }
    });
    console.log(`scenarios: ${count.group} group, ${count.venue} venue`);
    if (count.group + count.venue === before) throw new Error("Gemini produced no new scenarios this round");
  }
}

// ---------- questions + records (Laya notebook format) ----------

/** The request sent to the decision model for one scenario, built with the same builders runtime uses. */
export function buildCase(s: Scenario): DecisionRequest {
  if (s.kind === "venue") return venueFitRequest(s, s.vibe);
  return groupRequest({ size: s.size, when: s.when, lastHangout: s.last_hangout, favorites: s.shared_favorites, feasibleVibes: s.feasible_vibes });
}

/** Held out for eval: every HELDOUT_EVERY-th scenario of each kind. */
export function isHeldOut(id: string): boolean {
  return Number(id.slice(1)) % HELDOUT_EVERY === 0;
}

export interface Answer {
  choice: string;
  probabilities: Record<string, number>;
}
type Answers = Record<string, Answer>;
interface TeacherRow {
  id: string;
  answers: Answers;
  input_tokens?: number; // Jev
}

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;
/** The key with the highest probability; ties go to the earlier key. */
const argmax = (p: Record<string, number>, keys: string[]) => keys.reduce((best, k) => ((p[k] ?? 0) > (p[best] ?? 0) ? k : best));

/**
 * The training target for one question: the average of the two teachers' distributions over `keys`.
 * Null (dropped) unless their top answers agree or the averaged top probability is ≥ KEEP_TOP.
 */
export function consensus(keys: string[], jev: Answer, gemini: Answer): Answer | null {
  const probabilities = Object.fromEntries(keys.map((k) => [k, round4(((jev.probabilities[k] ?? 0) + (gemini.probabilities[k] ?? 0)) / 2)]));
  const choice = argmax(probabilities, keys);
  return jev.choice === gemini.choice || probabilities[choice]! >= KEEP_TOP ? { choice, probabilities } : null;
}

/**
 * One row in the shape `laya_finetune_typed_decisions` reads from LocalLLaMA/typed-decisions:
 * `state`, `questions` and `gold` are JSON strings; gold[qid] = { label, probabilities }.
 * `questions` stays byte-identical to runtime; a dropped question is simply absent from `gold`.
 */
export function toRecord(s: Scenario, c: DecisionRequest, gold: Answers) {
  return {
    id: s.id,
    workflow: s.kind === "group" ? "propose_vibe" : "venue_fit",
    state: JSON.stringify(c.state),
    questions: JSON.stringify(c.questions),
    gold: JSON.stringify(Object.fromEntries(Object.entries(gold).map(([qid, a]) => [qid, { label: a.choice, probabilities: a.probabilities }]))),
  };
}

// ---------- teachers ----------

async function askJev(c: DecisionRequest): Promise<Omit<TeacherRow, "id">> {
  const r = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.JEV_API_KEY}` },
    body: JSON.stringify({ state: c.state, model: JEV_MODEL, questions: c.questions }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`Jev ${r.status}`);
  const raw = (await r.json()) as { usage?: { input_tokens?: number; output_tokens?: number } };
  const res = parseDecision(raw, c.questions);
  const inputTokens = raw.usage?.input_tokens ?? 0;
  usage.jevIn += inputTokens;
  usage.jevOut += raw.usage?.output_tokens ?? 0;
  const answers = Object.fromEntries(Object.entries(res.answers).map(([qid, a]) => [qid, { choice: a.choice, probabilities: a.probabilities }]));
  return { answers, input_tokens: inputTokens };
}

/** Gemini sees exactly what Jev sees: the runtime request as JSON. */
export function teacherPrompt(c: DecisionRequest): string {
  return [
    "You label decisions for a friend-hangout app. Read `state` and each question's `instructions`.",
    "For every question, give your probability for each option in its `criteria`, using the option keys exactly. Each question's probabilities sum to 1.",
    "Be calibrated: put nearly all the weight on one option only when the answer is clear.",
    JSON.stringify({ state: c.state, questions: c.questions }),
  ].join("\n");
}

const schemaObject = (properties: Record<string, object>) => ({ type: "OBJECT", properties, required: Object.keys(properties) });

/** { qid: { optionKey: NUMBER } } for every question and option. */
export function teacherSchema(questions: DecisionQuestions): object {
  return schemaObject(
    Object.fromEntries(
      Object.entries(questions).map(([qid, q]) => [qid, schemaObject(Object.fromEntries(Object.keys(q.criteria).map((k) => [k, { type: "NUMBER" }])))]),
    ),
  );
}

const GeminiProbabilities = z.record(z.string(), z.record(z.string(), z.number().min(0)));

/** Normalises Gemini's numbers per question; throws when a question has none. */
export function geminiAnswers(raw: unknown, questions: DecisionQuestions): Answers {
  const parsed = GeminiProbabilities.parse(raw);
  return Object.fromEntries(
    Object.entries(questions).map(([qid, q]) => {
      const keys = Object.keys(q.criteria);
      const sum = keys.reduce((a, k) => a + (parsed[qid]?.[k] ?? 0), 0);
      if (!(sum > 0)) throw new Error(`Gemini: no probabilities for ${qid}`);
      const probabilities = Object.fromEntries(keys.map((k) => [k, round4((parsed[qid]?.[k] ?? 0) / sum)]));
      return [qid, { choice: argmax(probabilities, keys), probabilities }];
    }),
  );
}

async function askGeminiTeacher(c: DecisionRequest): Promise<Omit<TeacherRow, "id">> {
  // Low thinking: ~1s and ~40% of the tokens of the default, with near-identical probabilities.
  const raw = await geminiJson(teacherPrompt(c), teacherSchema(c.questions), 0, "low");
  return { answers: geminiAnswers(raw, c.questions) };
}

async function labelWith(name: string, file: string, scenarios: Scenario[], workers: number, ask: (c: DecisionRequest) => Promise<Omit<TeacherRow, "id">>) {
  const done = new Set(readJsonl<TeacherRow>(file).map((r) => r.id));
  const todo = scenarios.filter((s) => !done.has(s.id));
  console.log(`${name}: labelling ${todo.length} scenarios (${done.size} already done)`);
  let next = 0;
  let failed = 0;
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (next < todo.length) {
        const s = todo[next++]!;
        try {
          const row = await withRetry(`${name} ${s.id}`, () => ask(buildCase(s)));
          appendFileSync(file, JSON.stringify({ id: s.id, ...row }) + "\n");
        } catch (e) {
          failed++;
          console.warn(`${name} ${s.id} gave up: ${(e as Error).message}`);
        }
        if (next % 200 === 0) console.log(`  ${next}/${todo.length}`);
      }
    }),
  );
  if (failed) console.warn(`${name}: ${failed} scenarios failed; rerun to retry them`);
}

/** Rebuilds train.jsonl and heldout.jsonl from both teachers' answers and logs what was dropped. */
function buildDatasets(scenarios: Scenario[]) {
  const jev = new Map(readJsonl<TeacherRow>(JEV).map((r) => [r.id, r.answers]));
  const gemini = new Map(readJsonl<TeacherRow>(GEMINI).map((r) => [r.id, r.answers]));
  const rows = { train: [] as string[], heldout: [] as string[] };
  const stats: Record<string, { total: number; agree: number; kept: number }> = {};
  for (const s of scenarios) {
    const j = jev.get(s.id);
    const g = gemini.get(s.id);
    if (!j || !g) continue;
    const c = buildCase(s);
    const gold: Answers = {};
    for (const [qid, q] of Object.entries(c.questions)) {
      const st = (stats[qid] ??= { total: 0, agree: 0, kept: 0 });
      st.total++;
      if (j[qid]!.choice === g[qid]!.choice) st.agree++;
      const a = consensus(Object.keys(q.criteria), j[qid]!, g[qid]!);
      if (a) {
        gold[qid] = a;
        st.kept++;
      }
    }
    if (Object.keys(gold).length) rows[isHeldOut(s.id) ? "heldout" : "train"].push(JSON.stringify(toRecord(s, c, gold)));
  }
  writeFileSync(TRAIN, rows.train.map((r) => r + "\n").join(""));
  writeFileSync(HELDOUT, rows.heldout.map((r) => r + "\n").join(""));
  console.log(`\nrows: ${rows.train.length} train, ${rows.heldout.length} held out`);
  for (const [qid, st] of Object.entries(stats)) {
    console.log(`${qid}: kept ${st.kept}/${st.total} (dropped ${st.total - st.kept}); teachers' top answers agree on ${pct(st.agree / st.total)}`);
  }
}

// ---------- held-out eval: accuracy against the teacher consensus, no humans ----------

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const p50 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;

interface Gold {
  id: string;
  qid: string;
  label: string;
  firstKey: string;
}

type Ask = (c: DecisionRequest) => Promise<{ answers: Record<string, { choice: string }> }>;
const viaSystemOne = (base: string, key: string, model: string): Ask => (c) => callProvider(base, key, model, c.state, c.questions);

/** Asks once per held-out row, one call at a time so latency isn't queueing. */
async function evalLive(rows: { id: string; state: string; questions: string }[], golds: Gold[], ask: Ask) {
  const picks = new Map<string, string>();
  const ms: number[] = [];
  let failed = 0;
  for (const r of rows) {
    const t0 = performance.now();
    try {
      const res = await ask({ state: JSON.parse(r.state), questions: JSON.parse(r.questions) });
      ms.push(performance.now() - t0);
      for (const [qid, a] of Object.entries(res.answers)) picks.set(`${r.id}.${qid}`, a.choice);
    } catch {
      failed++;
    }
  }
  const acc = golds.filter((g) => picks.get(`${g.id}.${g.qid}`) === g.label).length / golds.length;
  return { acc: pct(acc) + (failed ? ` (${failed} calls failed)` : ""), p50: `${Math.round(p50(ms))} ms` };
}

async function evaluate() {
  if (!env.JEV_API_KEY) throw new Error("Set JEV_API_KEY");
  const rows = readJsonl<{ id: string; state: string; questions: string; gold: string }>(HELDOUT);
  const golds: Gold[] = rows.flatMap((r) => {
    const questions = JSON.parse(r.questions) as DecisionQuestions;
    return Object.entries(JSON.parse(r.gold) as Record<string, { label: string }>).map(([qid, g]) => ({
      id: r.id,
      qid,
      label: g.label,
      firstKey: Object.keys(questions[qid]!.criteria)[0]!,
    }));
  });
  const heldOutIds = new Set(readJsonl<Scenario>(SCENARIOS).filter((s) => isHeldOut(s.id)).map((s) => s.id));
  const jev = new Map(readJsonl<TeacherRow>(JEV).map((r) => [r.id, r.answers]));
  // The ceiling: how often the teachers' top answers agree on every held-out question, dropped ones included.
  const pairs = readJsonl<TeacherRow>(GEMINI)
    .filter((g) => heldOutIds.has(g.id))
    .flatMap((g) => Object.entries(g.answers).map(([qid, a]) => a.choice === jev.get(g.id)?.[qid]?.choice));

  console.log(`held out: ${rows.length} scenarios, ${golds.length} questions with a consensus label\n`);
  const table = [["Deterministic fallback (first option)", pct(golds.filter((g) => g.firstKey === g.label).length / golds.length), "0 ms"]];
  const jevLive = await evalLive(rows, golds, viaSystemOne("https://api.typesafe.ai", env.JEV_API_KEY, JEV_MODEL));
  table.push([`Jev (${JEV_MODEL})`, jevLive.acc, jevLive.p50]);
  const geminiLive = await evalLive(rows, golds, askGeminiTeacher);
  table.push([`Gemini (${GEMINI_MODEL}, low thinking)`, geminiLive.acc, geminiLive.p50]);
  if (env.LAYA_URL) {
    const laya = await evalLive(rows, golds, viaSystemOne(env.LAYA_URL, env.LAYA_API_KEY, LAYA_MODEL));
    table.push([`Laya fine-tuned (deployed, over HTTPS)`, laya.acc, laya.p50]);
  }
  table.push(["Teachers agree (ceiling)", pct(pairs.filter(Boolean).length / pairs.length), "—"]);
  console.log("| Model | Accuracy vs consensus | p50 latency |\n|---|---|---|");
  for (const r of table) console.log(`| ${r.join(" | ")} |`);
}

// ---------- main ----------

async function main() {
  if (!env.GEMINI_API_KEY || !env.JEV_API_KEY) throw new Error("Set GEMINI_API_KEY and JEV_API_KEY");
  if (env.DEMO_MODE) throw new Error("Unset DEMO_MODE: this script calls the live APIs");
  if (process.argv[2] === "eval") return evaluate();
  mkdirSync(OUT, { recursive: true });
  // 2,330 scenarios: ~1,180 group + ~1,080 venue (plus rounding); every 10th of each kind is held out.
  const total = Number(process.argv[2] ?? 2330);
  await generateScenarios({ group: Math.ceil((total * 1180) / 2260), venue: Math.floor((total * 1080) / 2260) });

  const scenarios = readJsonl<Scenario>(SCENARIOS);
  await labelWith("Jev", JEV, scenarios, 6, askJev); // ponytail: 6 workers × ~0.7s ≈ 500 req/min, under Jev's 1,200/min
  await labelWith("Gemini", GEMINI, scenarios, 8, askGeminiTeacher);
  buildDatasets(scenarios);
  console.log(`this run: Gemini ${usage.geminiIn} in / ${usage.geminiOut} out tokens; Jev ${usage.jevIn} in / ${usage.jevOut} out tokens`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
