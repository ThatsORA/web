// Owner: Riley — Gemini re-ranks only the deterministic top-10 shortlist.
// Inputs are aggregate matching facts; names, emails and calendar data never leave the server.
import { createHash } from "node:crypto";
import { z } from "zod";
import { env } from "../../env";
import { withFixture } from "../../lib/demoMode";
import type { RankedGroupSlot } from "./candidates";
import { earliestTimezone, formatTimeHHMM, getLocalParts } from "./timeMath";

const GEMINI_MODEL = "gemini-3.8-flash";
const SHORTLIST_SIZE = 10;
const CACHE_LIMIT = 200;

const RankingResult = z.object({
  ranking: z.array(z.object({
    candidate_id: z.string().min(1),
    reason: z.string().trim().min(1).max(90),
  })).min(1).max(SHORTLIST_SIZE),
});

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    ranking: {
      type: "ARRAY",
      minItems: 1,
      maxItems: SHORTLIST_SIZE,
      items: {
        type: "OBJECT",
        properties: {
          candidate_id: { type: "STRING" },
          reason: { type: "STRING", maxLength: 90 },
        },
        required: ["candidate_id", "reason"],
      },
    },
  },
  required: ["ranking"],
};

export interface RankedMatchCandidate extends RankedGroupSlot {
  matchReason: string | null;
}

export interface MatchRankingFact {
  candidate_id: string;
  member_count: number;
  mean_closeness: number;
  days_since_last_hangout: number | null;
  vibe: RankedGroupSlot["slot"]["vibe_tag"];
  local_day_time: string;
  favorite_category_overlap: { category: string; member_count: number }[];
}

type Ranking = z.infer<typeof RankingResult>["ranking"];
const cache = new Map<string, Ranking>();

export function matchCandidateId(candidate: RankedGroupSlot): string {
  return createHash("sha256")
    .update([
      candidate.group.groupKey,
      candidate.slot.start.toISOString(),
      candidate.slot.end.toISOString(),
      candidate.slot.vibe_tag,
    ].join("|"))
    .digest("hex");
}

export function matchRankingFacts(
  candidates: readonly RankedGroupSlot[],
  favoritesByUser: ReadonlyMap<string, readonly { category: string }[]>,
): MatchRankingFact[] {
  return candidates.slice(0, SHORTLIST_SIZE).map((candidate) => {
    const timezone = earliestTimezone(candidate.slot.start, Object.values(candidate.group.memberTimezones));
    const local = getLocalParts(candidate.slot.start, timezone);
    const favoriteCounts = new Map<string, number>();
    for (const userId of candidate.group.memberIds) {
      for (const favorite of new Set((favoritesByUser.get(userId) ?? []).map((item) => item.category))) {
        favoriteCounts.set(favorite, (favoriteCounts.get(favorite) ?? 0) + 1);
      }
    }
    return {
      candidate_id: matchCandidateId(candidate),
      member_count: candidate.group.memberIds.length,
      mean_closeness: Number(candidate.closeness.toFixed(3)),
      days_since_last_hangout: candidate.daysSinceLastHangout === null
        ? null
        : Math.round(candidate.daysSinceLastHangout),
      vibe: candidate.slot.vibe_tag,
      local_day_time: `${local.weekday} ${formatTimeHHMM(candidate.slot.start, timezone)}`,
      favorite_category_overlap: [...favoriteCounts]
        .filter(([, count]) => count >= 2)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([category, member_count]) => ({ category, member_count })),
    };
  });
}

export function validateMatchRanking(raw: unknown, candidateIds: ReadonlySet<string>): Ranking | null {
  const parsed = RankingResult.safeParse(raw);
  if (!parsed.success) return null;
  const ids = parsed.data.ranking.map((item) => item.candidate_id);
  if (new Set(ids).size !== ids.length || ids.some((id) => !candidateIds.has(id))) return null;
  return parsed.data.ranking;
}

function applyRanking(candidates: readonly RankedGroupSlot[], ranking: Ranking): RankedMatchCandidate[] {
  const byId = new Map(candidates.map((candidate) => [matchCandidateId(candidate), candidate]));
  const rankedIds = new Set(ranking.map((item) => item.candidate_id));
  return [
    ...ranking.map((item) => ({ ...byId.get(item.candidate_id)!, matchReason: item.reason })),
    ...candidates.filter((candidate) => !rankedIds.has(matchCandidateId(candidate)))
      .map((candidate) => ({ ...candidate, matchReason: null })),
  ];
}

function promptFor(facts: readonly MatchRankingFact[]): string {
  return [
    "Re-rank these hangout candidates using only the supplied aggregate facts.",
    "Prefer strong vibe and favorite overlap, groups that have waited longer, and suitable local timing.",
    "Return any non-empty subset in best-first order with each candidate_id at most once.",
    "Write a concrete reason of at most 90 characters using only these facts.",
    JSON.stringify(facts),
  ].join("\n");
}

async function callGemini(facts: readonly MatchRankingFact[], key: string): Promise<unknown> {
  return withFixture("gemini-rank", key, async () => {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: promptFor(facts) }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
      }),
      signal: AbortSignal.timeout(env.GEMINI_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Gemini ${response.status}`);
    const body = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return JSON.parse(body.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
  });
}

export async function rankWithGemini(
  candidates: readonly RankedGroupSlot[],
  favoritesByUser: ReadonlyMap<string, readonly { category: string }[]>,
): Promise<RankedMatchCandidate[]> {
  const fallback = candidates.map((candidate) => ({ ...candidate, matchReason: null }));
  if (!candidates.length || (!env.DEMO_MODE && !env.GEMINI_API_KEY)) return fallback;

  const facts = matchRankingFacts(candidates, favoritesByUser);
  const key = createHash("sha256").update(JSON.stringify(facts)).digest("hex");
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return applyRanking(candidates, hit);
  }

  try {
    const validIds = new Set(facts.map((fact) => fact.candidate_id));
    const ranking = validateMatchRanking(await callGemini(facts, key), validIds);
    if (!ranking) return fallback;
    cache.set(key, ranking);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    return applyRanking(candidates, ranking);
  } catch {
    return fallback;
  }
}
