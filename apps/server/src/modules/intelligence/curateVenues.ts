// Owner: Ojas — the ONE Gemini call (plan §8).
// Contract: always returns exactly 3 options. The deterministic fallback below
// is what ships if Gemini fails validation or times out — keep it working.
import type { CurateContext, EventOption, RankedVenue } from "@web/contract";

const PRICE = ["", "$", "$$", "$$$", "$$$$"];

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

export async function curateVenues(venues: RankedVenue[], _ctx: CurateContext): Promise<EventOption[]> {
  // TODO(Ojas): Gemini Flash + responseSchema, validate place_ids ⊆ input,
  // blurbs ≤ 90 chars, GEMINI_TIMEOUT_MS, cache by vibe + sorted ids.
  return fallbackOptions(venues);
}
