// Owner: Ojas — venue curation (plan §8, #230). The decision model filters for vibe fit,
// code picks the 3 options, and the ONE Gemini call writes only the text.
// Contract: always returns exactly 3 options. Decision fails → top 3 by route_score;
// Gemini fails → facts_line only and no match reason.
import { z } from "zod";
import type { CurateContext, EventOption, RankedVenue } from "@web/contract";
import { env } from "../../env";
import { withFixture } from "../../lib/demoMode";
import { askDecision, venueFitRequest } from "./decision";

const PRICE = ["", "$", "$$", "$$$", "$$$$"];
const GEMINI_MODEL = "gemini-3.8-flash";

export function factsLine(v: RankedVenue): string {
  const parts: string[] = [];
  if (v.rating != null) parts.push(`★${v.rating.toFixed(1)}`);
  if (v.price_level != null) parts.push(PRICE[v.price_level] ?? "");
  parts.push(`max ${Math.round(v.max_travel_min)} min travel`);
  return parts.filter(Boolean).join(" · ");
}

export function fallbackOptions(venues: RankedVenue[]): EventOption[] {
  return [...venues]
    .sort((a, b) => a.route_score - b.route_score)
    .slice(0, 3)
    .map((v, i) => ({ ...v, rank: i + 1, facts_line: factsLine(v), ai_blurb: null }));
}

/** Up to 3 review snippets (≤200 chars) from Place Details (New). Failure = no snippets. */
async function reviewSnippets(placeId: string): Promise<string[]> {
  try {
    const res = await withFixture("place-details", placeId, async () => {
      const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
        headers: { "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY, "X-Goog-FieldMask": "reviews" },
      });
      if (!r.ok) throw new Error(`Place Details ${r.status}`);
      return (await r.json()) as { reviews?: { text?: { text?: string } }[] };
    });
    return (res.reviews ?? [])
      .map((rv) => rv.text?.text?.trim().slice(0, 200))
      .filter((t): t is string => !!t)
      .slice(0, 3);
  } catch {
    return [];
  }
}

const GeminiResult = z.object({
  options: z.array(z.object({ place_id: z.string(), blurb: z.string().min(1).max(90) })).length(3),
  match_reason: z.string().min(1).max(90),
});

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    options: {
      type: "ARRAY",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "OBJECT",
        properties: { place_id: { type: "STRING" }, blurb: { type: "STRING", maxLength: 90 } },
        required: ["place_id", "blurb"],
      },
    },
    match_reason: { type: "STRING", maxLength: 90 },
  },
  required: ["options", "match_reason"],
};

/** One Gemini JSON call (text only) with a response schema, a timeout and a fixture. */
export async function callGemini(prompt: string, key: string, responseSchema: object = RESPONSE_SCHEMA): Promise<unknown> {
  return withFixture("gemini", key, async () => {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema },
      }),
      signal: AbortSignal.timeout(env.GEMINI_TIMEOUT_MS),
    });
    if (!r.ok) throw new Error(`Gemini ${r.status}`);
    const body = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return JSON.parse(body.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
  });
}

/** A venue, or an activity option (#322) that also carries its activity and its own time. */
type Pick3 = RankedVenue & Pick<EventOption, "activity" | "starts_at" | "ends_at">;

function buildPrompt(venues: (Pick3 & { reviews: string[] })[], ctx: CurateContext): string {
  const input = venues.map((v) => ({
    place_id: v.place_id,
    name: v.name,
    activity: v.activity,
    primary_type: v.primary_type,
    price_level: v.price_level,
    rating: v.rating,
    user_rating_count: v.user_rating_count,
    max_travel_min: Math.round(v.max_travel_min),
    total_travel_min: Math.round(Object.values(v.travel_minutes).reduce((a, b) => a + b, 0)),
    reviews: v.reviews,
  }));
  return [
    `A friend group is meeting for a "${ctx.vibe_tag}" hangout, ${ctx.slot_local}.`,
    `Their favorite categories (counts): ${JSON.stringify(ctx.favorite_counts)}.`,
    "The 3 venues they will vote on:",
    JSON.stringify(input),
    "1) Write one blurb per venue, at most 90 characters, using its exact place_id.",
    "2) Write a match_reason, at most 90 characters, saying why this hangout suits the group and time slot.",
    "Use ONLY facts from the input above.",
  ].join("\n");
}

/**
 * `top` is sorted by route_score and `pFit[i]` is P(venue i fits the vibe).
 * Returns 3: the fits (P ≥ 0.5) by route_score, topped up from the rest by route_score.
 */
export function pickVenues(top: RankedVenue[], pFit: number[]): RankedVenue[] {
  const fits = top.filter((_, i) => pFit[i]! >= 0.5);
  return [...fits, ...top.filter((v) => !fits.includes(v))].slice(0, 3);
}

export interface Curation {
  options: EventOption[];
  matchReason: string | null;
}

const toOptions = (picks: Pick3[]): EventOption[] =>
  picks.map((v, i) => ({ ...v, rank: i + 1, facts_line: factsLine(v), ai_blurb: null }));

// ponytail: per-instance in-memory LRU, capped at 200 successful curations.
const cache = new Map<string, Curation>();

/** The decision model filters the top 5 for vibe fit, code picks 3, Gemini writes the text. Always 3 options. */
export async function curateVenues(venues: RankedVenue[], ctx: CurateContext): Promise<Curation> {
  const top = [...venues].sort((a, b) => a.route_score - b.route_score).slice(0, 5);
  if (top.length < 3) return { options: fallbackOptions(top), matchReason: null };

  const key = `${JSON.stringify(ctx)}|${top.map((v) => v.place_id).sort().join(",")}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const reviews = await Promise.all(top.map((v) => reviewSnippets(v.place_id)));

  let picks = top.slice(0, 3);
  let decided = false;
  try {
    // One request per venue, in the Laya training format; any failure → keep the top 3.
    const replies = await Promise.all(top.map((v, i) => askDecision(venueFitRequest({ ...v, reviews: reviews[i]! }, ctx.vibe_tag))));
    picks = pickVenues(top, replies.map((r) => r.answers.venue_fit!.probabilities.A!));
    decided = true;
  } catch {
    // keep the top 3 by route_score
  }

  const result = await writeText(picks.map((v) => ({ ...v, reviews: reviews[top.indexOf(v)]! })), ctx);
  if (decided && result.matchReason !== null) {
    cache.set(key, result);
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
  }
  return result;
}

/** Options code already picked (the automated flow, #322/#311): no venue-fit decision, Gemini writes only the text. */
export async function curateActivities(picks: Pick3[], ctx: CurateContext): Promise<Curation> {
  const reviews = await Promise.all(picks.map((v) => reviewSnippets(v.place_id)));
  return writeText(picks.map((v, i) => ({ ...v, reviews: reviews[i]! })), ctx);
}

/** The ONE Gemini text call: blurbs + match reason for the 3 picks. Fails → facts only, no match reason. */
async function writeText(picks: (Pick3 & { reviews: string[] })[], ctx: CurateContext): Promise<Curation> {
  const plain: Curation = { options: toOptions(picks.map(({ reviews: _, ...v }) => v)), matchReason: null };
  if (!env.DEMO_MODE && !env.GEMINI_API_KEY) return plain;

  try {
    const parsed = GeminiResult.safeParse(await callGemini(buildPrompt(picks, ctx), ctx.vibe_tag));
    if (!parsed.success) return plain;
    const blurbs = new Map(parsed.data.options.map((o) => [o.place_id, o.blurb.trim()]));
    if (blurbs.size !== 3 || !picks.every((v) => blurbs.has(v.place_id))) return plain;
    return {
      options: plain.options.map((o) => ({ ...o, ai_blurb: blurbs.get(o.place_id)! })),
      matchReason: parsed.data.match_reason.trim(),
    };
  } catch {
    return plain;
  }
}
