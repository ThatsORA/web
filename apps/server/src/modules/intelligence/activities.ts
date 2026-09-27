// Owner: Ojas — activity labels for discovered places (#322). Gemini only writes text: ONE call per
// squad labels each place as an activity with a typical length. Code validates every entry and falls
// back per place (primary type, 90 min); a failed call falls back for all. Picking the 3 is code:
// preference fit (#311) sums each member's decision-model probabilities over the candidates.
import { z } from "zod";
import type { RankedVenue } from "@web/contract";
import { env } from "../../env";
import type { ActivityCandidate } from "../venues/discover";
import { callGemini } from "./curateVenues";
import { askDecision, memberFitRequest, type MemberProfile } from "./decision";

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

const byCommute = (a: ActivityCandidate, b: ActivityCandidate) => a.route_score - b.route_score || a.place_id.localeCompare(b.place_id);

/** The first 3 of `ranked` with distinct activity labels (case-insensitive); a repeat is skipped for the next best. */
function distinctTop3(ranked: readonly ActivityCandidate[]): ActivityCandidate[] {
  const byLabel = new Map<string, ActivityCandidate>();
  for (const c of ranked) {
    const label = c.activity.toLowerCase();
    if (!byLabel.has(label)) byLabel.set(label, c);
  }
  return [...byLabel.values()].slice(0, 3);
}

/**
 * The fallback 3 vote options: the best by worst member commute (route_score) with distinct activity labels.
 * Fewer than 3 distinct → returns fewer.
 */
export function pickActivities(candidates: readonly ActivityCandidate[]): ActivityCandidate[] {
  return distinctTop3([...candidates].sort(byCommute));
}

/**
 * Preference fit aggregation (#311). `memberProbs[m][i]` = member m's P(candidate i).
 * Score = the sum over members; the top 3 with distinct labels (ties by commute).
 * `squadAppeal` = the mean member probability of the #1 pick.
 */
export function pickByPreference(
  candidates: readonly ActivityCandidate[],
  memberProbs: readonly (readonly number[])[],
): { picks: ActivityCandidate[]; squadAppeal: number } {
  const score = new Map(candidates.map((c, i) => [c, memberProbs.reduce((sum, probs) => sum + probs[i]!, 0)]));
  const picks = distinctTop3([...candidates].sort((a, b) => score.get(b)! - score.get(a)! || byCommute(a, b)));
  return { picks, squadAppeal: picks.length ? score.get(picks[0]!)! / memberProbs.length : 0 };
}

export const APPEAL_THRESHOLD = 0.2;

/**
 * The 3 vote options for a squad (#311): one `fit` decision per member, in parallel, summed by code.
 * `null` = the squad's appeal is under 0.2, so don't propose (`force` skips that gate but keeps the pick).
 * Any member call fails → `pickActivities` (by commute). Fewer than 3 distinct labels → no model call.
 */
export async function chooseActivities(
  candidates: readonly ActivityCandidate[],
  profiles: readonly MemberProfile[],
  force: boolean,
): Promise<ActivityCandidate[] | null> {
  const fallback = pickActivities(candidates);
  if (fallback.length < 3) return fallback;
  let result: ReturnType<typeof pickByPreference>;
  try {
    const replies = await Promise.all(profiles.map((p) => askDecision(memberFitRequest(p, candidates))));
    result = pickByPreference(candidates, replies.map((r) => candidates.map((_, i) => r.answers.fit!.probabilities[`c${i}`]!)));
  } catch {
    return fallback;
  }
  return force || result.squadAppeal >= APPEAL_THRESHOLD ? result.picks : null;
}
