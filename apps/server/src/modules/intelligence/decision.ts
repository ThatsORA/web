// Owner: Ojas — the decision client (#196). Laya (self-hosted) first, Jev (TypeSafe) as fallback.
// Both speak POST /v1/systemone. Throws when both fail; callers own the deterministic fallback.
// Facts are plain words only: no names, emails, calendar data or raw timestamps leave the server.
import { createHash } from "node:crypto";
import { z } from "zod";
import type { RankedVenue, VibeTag } from "@web/contract";
import { env } from "../../env";
import { withFixture } from "../../lib/demoMode";

const JEV_URL = "https://api.typesafe.ai";
const JEV_MODEL = "jev-1.13.0";
const LAYA_MODEL = "laya";

export interface ChoiceQuestion {
  type: "choice";
  instructions: string | Record<string, unknown>;
  criteria: Record<string, string>;
}
export type DecisionQuestions = Record<string, ChoiceQuestion>;

// Thresholds read `probabilities`, not `confidence`: Laya and Jev define confidence differently.
const ChoiceAnswer = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  confidence: z.number(),
  probabilities: z.record(z.string(), z.number()),
});
const DecisionResponse = z.object({ model: z.string(), answers: z.record(z.string(), ChoiceAnswer) });
export type DecisionResponse = z.infer<typeof DecisionResponse>;

/** Zod-parses a reply and checks every question got an answer drawn from its own criteria keys. */
export function parseDecision(raw: unknown, questions: DecisionQuestions): DecisionResponse {
  const res = DecisionResponse.parse(raw);
  for (const [id, q] of Object.entries(questions)) {
    const a = res.answers[id];
    if (!a || !(a.choice in q.criteria) || !Object.keys(q.criteria).every((k) => k in a.probabilities)) {
      throw new Error(`Decision: bad answer for ${id}`);
    }
  }
  return res;
}

async function callProvider(base: string, apiKey: string, model: string, state: unknown, questions: DecisionQuestions) {
  const r = await fetch(`${base}/v1/systemone`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ state, model, questions }),
    signal: AbortSignal.timeout(env.DECISION_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`Decision ${model} ${r.status}`);
  return parseDecision(await r.json(), questions);
}

export async function askDecision(state: string | object, questions: DecisionQuestions): Promise<DecisionResponse> {
  const key = createHash("sha256").update(JSON.stringify({ state, questions })).digest("hex");
  const raw = await withFixture("decision", key, async () => {
    if (env.LAYA_URL) {
      try {
        return await callProvider(env.LAYA_URL, env.LAYA_API_KEY, LAYA_MODEL, state, questions);
      } catch {
        // fall through to Jev
      }
    }
    if (!env.JEV_API_KEY) throw new Error("Decision: no provider configured");
    return callProvider(JEV_URL, env.JEV_API_KEY, JEV_MODEL, state, questions);
  });
  return parseDecision(raw, questions); // fixtures are unvalidated JSON
}

// ---------- question builders (shared by runtime and the training-data script, #235) ----------
// Yes/no questions are 2-option A/B Choices: neutral keys, because Laya's noul has label bias.

const VIBE_DESCRIPTIONS: Record<VibeTag, string> = {
  quick_coffee: "A quick coffee or tea catch-up, under an hour, during the day",
  casual_hangout: "A relaxed hangout of one to two hours at a cafe, bakery or casual restaurant",
  dinner: "A sit-down dinner together in the evening, about two hours",
  night_out: "A night out of two to three hours at a bar, club or bowling alley",
};

/** Plain-word group facts for `proposeQuestion`/`vibeQuestion`. Runtime (#231) and the training data (#235) share this format. */
export function groupFacts(g: { size: number; when: string; lastHangout: string; favorites: string[] }): string[] {
  return [
    `Group of ${g.size} friends`,
    `Shared free time: ${g.when}`,
    `Last hangout: ${g.lastHangout}`,
    `Shared favorites: ${g.favorites.length ? g.favorites.map((f) => f.replaceAll("_", " ")).join(", ") : "none"}`,
  ];
}

/** Should we suggest a hangout to this group now? `facts` are plain-word lines, e.g. "last hangout was 3 weeks ago". */
export function proposeQuestion(facts: string[]): ChoiceQuestion {
  return {
    type: "choice",
    instructions: { facts, question: "Given `facts` about a friend group, should the app suggest a hangout to them now?" },
    criteria: { A: "Yes, suggest a hangout now", B: "No, not now" },
  };
}

/** Which of the feasible vibes suits this group and time slot best? */
export function vibeQuestion(facts: string[], feasibleVibes: VibeTag[]): ChoiceQuestion {
  return {
    type: "choice",
    instructions: { facts, question: "Given `facts` about a friend group and their free time, which kind of hangout suits them best?" },
    criteria: Object.fromEntries(feasibleVibes.map((v) => [v, VIBE_DESCRIPTIONS[v]])),
  };
}

type VenueFacts = Pick<RankedVenue, "name" | "primary_type" | "price_level" | "rating">;

/** Does this venue fit the vibe? */
export function venueFitQuestion(venue: VenueFacts, vibe: VibeTag): ChoiceQuestion {
  const facts = [`Name: ${venue.name}`];
  if (venue.primary_type) facts.push(`Type: ${venue.primary_type.replaceAll("_", " ")}`);
  if (venue.price_level != null) facts.push(`Price: ${"$".repeat(venue.price_level)} out of $$$$`);
  if (venue.rating != null) facts.push(`Rating: ${venue.rating.toFixed(1)} out of 5`);
  return {
    type: "choice",
    instructions: { venue: facts, hangout: VIBE_DESCRIPTIONS[vibe], question: "Is `venue` a good place for `hangout`?" },
    criteria: { A: "Yes, it fits this hangout", B: "No, it does not fit this hangout" },
  };
}
