// Owner: Ojas — Laya training data (#235). Gemini writes synthetic scenarios, Jev labels them
// through the same #228 question builders runtime uses, and we write the Laya notebook's format.
// Run: pnpm --filter @web/server decision-data [totalScenarios]   (needs GEMINI_API_KEY + JEV_API_KEY)
// Resumable: every step appends to scripts/decision-data/ and skips ids already written.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { VibeTag } from "@web/contract";
import { env } from "../src/env";
import {
  groupFacts,
  parseDecision,
  proposeQuestion,
  venueFitQuestion,
  vibeQuestion,
  type DecisionQuestions,
} from "../src/modules/intelligence/decision";

const OUT = join(import.meta.dirname, "decision-data");
const SCENARIOS = join(OUT, "scenarios.jsonl"); // every Gemini scenario, append-only
const TRAIN = join(OUT, "train.jsonl");
const GOLD_JEV = join(OUT, "gold-jev.jsonl");
const GOLD_CSV = join(OUT, "gold.csv");

const GEMINI_MODEL = "gemini-3.8-flash";
const JEV_MODEL = "jev-1.13.0";
const BATCH = 25;
const GOLD_PER_KIND = 75; // 150 gold scenarios total
const GOLD_EVERY = 15; // every 15th scenario of a kind is held out, so gold spans every batch theme

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

async function askGemini(kind: Kind, prompt: string): Promise<unknown[]> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA[kind], temperature: 1.0 },
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
  return z.array(z.unknown()).parse(JSON.parse(body.candidates?.[0]?.content?.parts?.[0]?.text ?? ""));
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
      jobs.map((j) => withRetry(`Gemini ${j.kind}`, () => askGemini(j.kind, (j.kind === "group" ? groupPrompt : venuePrompt)(j.n, j.theme)))),
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

const GROUP_STATE = { task: "A friend-hangout app's weekly check: should it suggest a hangout to this friend group now, and what kind?" };

/** The state + questions sent to the decision model for one scenario, built with the runtime #228 builders. */
export function buildCase(s: Scenario): { state: unknown; questions: DecisionQuestions } {
  if (s.kind === "venue") {
    const venue = { name: s.name, primary_type: s.primary_type, price_level: s.price_level, rating: s.rating };
    return {
      state: { name: s.name, primary_type: s.primary_type, reviews: s.reviews },
      questions: { venue_fit: venueFitQuestion(venue, s.vibe) },
    };
  }
  const facts = groupFacts({ size: s.size, when: s.when, lastHangout: s.last_hangout, favorites: s.shared_favorites });
  const questions: DecisionQuestions = { propose: proposeQuestion(facts) };
  if (s.feasible_vibes.length >= 2) questions.vibe = vibeQuestion(facts, s.feasible_vibes); // 1 option = nothing to decide
  return { state: GROUP_STATE, questions };
}

/** Held-out gold: every GOLD_EVERY-th scenario of each kind, up to GOLD_PER_KIND. */
export function isGold(id: string): boolean {
  const n = Number(id.slice(1));
  return n % GOLD_EVERY === 0 && n / GOLD_EVERY < GOLD_PER_KIND;
}

type Answers = Record<string, { choice: string; probabilities: Record<string, number> }>;

/**
 * One row in the shape `laya_finetune_typed_decisions` reads from LocalLLaMA/typed-decisions:
 * `state`, `questions` and `gold` are JSON strings; gold[qid] = { label, probabilities } (Jev's soft labels).
 */
export function toRecord(s: Scenario, c: ReturnType<typeof buildCase>, answers: Answers, jevInputTokens: number) {
  const gold = Object.fromEntries(
    Object.keys(c.questions).map((qid) => [qid, { label: answers[qid]!.choice, probabilities: answers[qid]!.probabilities }]),
  );
  return {
    id: s.id,
    workflow: s.kind === "group" ? "propose_vibe" : "venue_fit",
    state: JSON.stringify(c.state),
    questions: JSON.stringify(c.questions),
    gold: JSON.stringify(gold),
    jev_input_tokens: jevInputTokens,
  };
}

async function askJev(c: ReturnType<typeof buildCase>) {
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
  return { answers: res.answers, inputTokens };
}

async function labelAll(scenarios: Scenario[]) {
  const done = new Set([...readJsonl<{ id: string }>(TRAIN), ...readJsonl<{ id: string }>(GOLD_JEV)].map((r) => r.id));
  const todo = scenarios.filter((s) => !done.has(s.id));
  console.log(`labelling ${todo.length} scenarios with Jev (${done.size} already done)`);
  let next = 0;
  let failed = 0;
  // ponytail: 6 workers × ~0.7s/call ≈ 500 req/min, well under Jev's 1,200/min.
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (next < todo.length) {
        const s = todo[next++]!;
        const c = buildCase(s);
        try {
          const { answers, inputTokens } = await withRetry(`Jev ${s.id}`, () => askJev(c));
          appendFileSync(isGold(s.id) ? GOLD_JEV : TRAIN, JSON.stringify(toRecord(s, c, answers, inputTokens)) + "\n");
        } catch (e) {
          failed++;
          console.warn(`Jev ${s.id} gave up: ${(e as Error).message}`);
        }
        if (next % 200 === 0) console.log(`  ${next}/${todo.length}`);
      }
    }),
  );
  if (failed) console.warn(`${failed} scenarios failed; rerun to retry them`);
}

// ---------- gold CSV for human labellers ----------

export function csvRow(fields: (string | number)[]): string {
  return fields.map((f) => `"${String(f).replaceAll('"', '""')}"`).join(",");
}

const HUMAN_QUESTION: Record<string, string> = {
  propose: "Should the app suggest a hangout to this group now?",
  vibe: "Which kind of hangout suits this group best?",
  venue_fit: "Is this venue a good place for this hangout?",
};

/** Plain-English scenario text for a human labeller. */
export function scenarioText(s: Scenario, c: ReturnType<typeof buildCase>): string {
  if (s.kind === "group") return (c.questions.propose!.instructions as { facts: string[] }).facts.join(". ") + ".";
  const ins = c.questions.venue_fit!.instructions as { venue: string[]; hangout: string };
  const reviews = s.reviews.length ? ` Reviews: ${s.reviews.map((r) => `"${r}"`).join(" ")}` : " No reviews.";
  return `Venue: ${ins.venue.join(". ")}.${reviews} Planned hangout: ${ins.hangout}.`;
}

export function goldCsv(scenarios: Scenario[]): string {
  const rows = [csvRow(["id", "scenario", "question", "allowed_answers", "label"])];
  for (const s of scenarios.filter((x) => isGold(x.id))) {
    const c = buildCase(s);
    for (const [qid, q] of Object.entries(c.questions)) {
      const allowed = Object.entries(q.criteria).map(([k, v]) => `${k} = ${v}`).join(" | ");
      rows.push(csvRow([`${s.id}.${qid}`, scenarioText(s, c), HUMAN_QUESTION[qid]!, allowed, ""]));
    }
  }
  return rows.join("\n") + "\n";
}

// ---------- main ----------

async function main() {
  if (!env.GEMINI_API_KEY || !env.JEV_API_KEY) throw new Error("Set GEMINI_API_KEY and JEV_API_KEY");
  if (env.DEMO_MODE) throw new Error("Unset DEMO_MODE: this script calls the live APIs");
  mkdirSync(OUT, { recursive: true });
  // 2,330 scenarios: ~1,140 propose + ~960 vibe + ~1,040 venue-fit train questions, plus 75 + 75 gold scenarios.
  const total = Number(process.argv[2] ?? 2330);
  await generateScenarios({ group: Math.ceil((total * 1180) / 2260), venue: Math.floor((total * 1080) / 2260) });

  const scenarios = readJsonl<Scenario>(SCENARIOS);
  await labelAll(scenarios);
  writeFileSync(GOLD_CSV, goldCsv(scenarios));

  const train = readJsonl<{ questions: string; jev_input_tokens: number }>(TRAIN);
  const gold = readJsonl<{ questions: string; jev_input_tokens: number }>(GOLD_JEV);
  const qCount = (rows: { questions: string }[], qid: string) => rows.filter((r) => qid in JSON.parse(r.questions)).length;
  const jevInAll = [...train, ...gold].reduce((a, r) => a + (r.jev_input_tokens), 0);
  console.log(`\nscenarios: ${scenarios.length} (${scenarios.filter((s) => isGold(s.id)).length} gold)`);
  console.log(`train questions: propose ${qCount(train, "propose")}, vibe ${qCount(train, "vibe")}, venue_fit ${qCount(train, "venue_fit")}`);
  console.log(`gold questions: propose ${qCount(gold, "propose")}, vibe ${qCount(gold, "vibe")}, venue_fit ${qCount(gold, "venue_fit")}`);
  console.log(`this run: Gemini ${usage.geminiIn} in / ${usage.geminiOut} out tokens; Jev ${usage.jevIn} in / ${usage.jevOut} out tokens`);
  console.log(`Jev input tokens across all records: ${jevInAll} ≈ $${((jevInAll / 1e6) * 0.042).toFixed(4)} at $0.042/Mtok`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
