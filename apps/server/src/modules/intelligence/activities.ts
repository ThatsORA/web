// Owner: Ojas — activity labels for discovered places (#322). Gemini only writes text: ONE call per
// squad labels each place as an activity with a typical length. Code validates every entry and falls
// back per place (primary type, 90 min); a failed call falls back for all. Picking the 3 is code.
import { z } from "zod";
import type { RankedVenue } from "@web/contract";
import { env } from "../../env";
import type { ActivityCandidate } from "../venues/discover";
import { callGemini } from "./curateVenues";

export interface ActivityInfo {
  activity: string; // "Bouldering"
  typical_minutes: number;
}

const Reply = z.object({ activities: z.array(z.unknown()) });
const Entry = z.object({
  place_id: z.string(),
  activity: z.string().trim().min(1).max(40),
  typical_minutes: z.number().int().min(30).max(240),
});

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    activities: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          place_id: { type: "STRING" },
          activity: { type: "STRING", maxLength: 40 },
          typical_minutes: { type: "INTEGER", minimum: 30, maximum: 240 },
        },
        required: ["place_id", "activity", "typical_minutes"],
      },
    },
  },
  required: ["activities"],
};

/** "bowling_alley" → "Bowling alley", 90 min. */
export function fallbackActivity(primaryType: string | null): ActivityInfo {
  const label = primaryType?.replaceAll("_", " ") || "hangout";
  return { activity: (label[0]!.toUpperCase() + label.slice(1)).slice(0, 40), typical_minutes: 90 };
}

type Place = Pick<RankedVenue, "place_id" | "name" | "primary_type">;

function buildPrompt(places: readonly Place[]): string {
  return [
    "A friend group is choosing what to do together. For each place below, write:",
    '- activity: what the group would do there, at most 40 characters (e.g. "Bouldering", "Board games", "Sunset walk", "Tacos");',
    "- typical_minutes: how long a group usually spends doing it, 30 to 240.",
    "One entry per place, using its exact place_id. Use ONLY the input.",
    JSON.stringify(places.map(({ place_id, name, primary_type }) => ({ place_id, name, primary_type }))),
  ].join("\n");
}

/** An activity for every place: Gemini's where it's valid, otherwise the fallback. Never throws. */
export async function describeActivities(places: readonly Place[]): Promise<Map<string, ActivityInfo>> {
  const out = new Map(places.map((p) => [p.place_id, fallbackActivity(p.primary_type)]));
  if (!places.length || (!env.DEMO_MODE && !env.GEMINI_API_KEY)) return out;
  try {
    const reply = Reply.parse(await callGemini(buildPrompt(places), "activities", RESPONSE_SCHEMA));
    for (const entry of reply.activities) {
      const parsed = Entry.safeParse(entry);
      if (!parsed.success || !out.has(parsed.data.place_id)) continue; // invalid → fallback; unknown id → dropped
      out.set(parsed.data.place_id, { activity: parsed.data.activity, typical_minutes: parsed.data.typical_minutes });
    }
  } catch {
    // fallback for all
  }
  return out;
}

/**
 * The 3 vote options. Seam for preference fit (#311): until then, the 3 best by worst member commute
 * (route_score) with distinct activity labels. Fewer than 3 distinct → returns fewer.
 */
export function pickActivities(candidates: readonly ActivityCandidate[]): ActivityCandidate[] {
  const byLabel = new Map<string, ActivityCandidate>();
  for (const c of [...candidates].sort((a, b) => a.route_score - b.route_score || a.place_id.localeCompare(b.place_id))) {
    const label = c.activity.toLowerCase();
    if (!byLabel.has(label)) byLabel.set(label, c);
  }
  return [...byLabel.values()].slice(0, 3);
}
