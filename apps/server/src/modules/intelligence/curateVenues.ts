// Owner: Ojas — the ONE Gemini call (plan §8).
// Contract: always returns exactly 3 options. The deterministic fallback below
// is what ships if Gemini fails validation or times out — keep it working.
import { z } from "zod";
import type { CurateContext, EventOption, RankedVenue } from "@web/contract";
import { env } from "../../env";
import { withFixture } from "../../lib/demoMode";

const PRICE = ["", "$", "$$", "$$$", "$$$$"];
// Lite first; escalate to full Flash only when Lite errors or returns invalid output.
const GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.8-flash"];

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
  },
  required: ["options"],
};

async function callGemini(model: string, prompt: string, vibe: string): Promise<unknown> {
  return withFixture("gemini", vibe, async () => {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
      }),
      signal: AbortSignal.timeout(env.GEMINI_TIMEOUT_MS),
    });
    if (!r.ok) throw new Error(`Gemini ${r.status}`);
    const body = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return JSON.parse(body.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
  });
}

function buildPrompt(venues: (RankedVenue & { reviews: string[] })[], ctx: CurateContext): string {
  const input = venues.map((v) => ({
    place_id: v.place_id,
    name: v.name,
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
    "Candidate venues, best travel first:",
    JSON.stringify(input),
    "1) Drop venues whose reviews contradict the vibe (e.g. a steakhouse for a casual hangout).",
    "2) Pick exactly 3 of the remaining venues, using their exact place_id.",
    "3) Write one blurb per venue, at most 90 characters, using ONLY facts from the input above.",
  ].join("\n");
}

// ponytail: in-process Map, unbounded and per-instance; fine for a demo-scale server.
const cache = new Map<string, EventOption[]>();

export async function curateVenues(venues: RankedVenue[], ctx: CurateContext): Promise<EventOption[]> {
  const top = [...venues].sort((a, b) => a.route_score - b.route_score).slice(0, 5);
  const fallback = fallbackOptions(top);
  if (top.length < 3 || (!env.DEMO_MODE && !env.GEMINI_API_KEY)) return fallback;

  const key = `${ctx.vibe_tag}|${top.map((v) => v.place_id).sort().join(",")}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const withReviews = await Promise.all(top.map(async (v) => ({ ...v, reviews: await reviewSnippets(v.place_id) })));
  const prompt = buildPrompt(withReviews, ctx);
  // One GEMINI_TIMEOUT_MS budget across both models; a timeout goes straight to fallback.
  const TIMEOUT = new Error("Gemini timeout");
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(TIMEOUT), env.GEMINI_TIMEOUT_MS);
  });
  try {
    for (const model of GEMINI_MODELS) {
      try {
        const options = toOptions(await Promise.race([callGemini(model, prompt, ctx.vibe_tag), timeout]), top);
        if (options) {
          cache.set(key, options);
          return options;
        }
      } catch (e) {
        if (e === TIMEOUT) break;
      }
    }
  } finally {
    clearTimeout(timer);
  }
  return fallback;
}

/** Validated Gemini output → options, or null if it fails the schema or names a place_id not in the input. */
function toOptions(raw: unknown, top: RankedVenue[]): EventOption[] | null {
  const parsed = GeminiResult.safeParse(raw);
  if (!parsed.success) return null;
  const byId = new Map(top.map((v) => [v.place_id, v]));
  const ids = parsed.data.options.map((o) => o.place_id);
  if (new Set(ids).size !== 3 || !ids.every((id) => byId.has(id))) return null;
  return parsed.data.options.map((o, i) => {
    const v = byId.get(o.place_id)!;
    return { ...v, rank: i + 1, facts_line: factsLine(v), ai_blurb: o.blurb.trim() };
  });
}
