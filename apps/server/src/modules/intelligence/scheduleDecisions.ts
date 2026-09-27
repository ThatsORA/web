// Owner: Ojas — the propose gate + vibe choice for the matcher (#231, #196).
// One askDecision call per candidate, in the Laya training format (`groupRequest`): `propose`
// (A = suggest now) and `vibe` (among that window's feasible vibes). Facts are plain words:
// no names, emails, ids or raw timestamps leave the server.
import type { RankedGroupSlot } from "../matching/candidates";
import { earliestTimezone, getLocalParts, type ClassifiedSlot } from "../matching/timeMath";
import { askDecision, groupRequest, type DecisionRequest, type DecisionResponse } from "./decision";

export const PROPOSE_THRESHOLD = 0.6;

export interface DecisionCandidate extends RankedGroupSlot {
  /** Every feasible slot of the candidate's free window (feasibleSlots); `slot` is the priority pick. */
  feasible: ClassifiedSlot[];
}

type FavoritesByUser = ReadonlyMap<string, readonly { category: string }[]>;

/** Phrased like the training scenarios: "yesterday", "5 days ago", "3 weeks ago", "2 months ago". */
function lastHangout(days: number | null): string {
  if (days === null) return "never";
  const d = Math.floor(days);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.floor(d / 7)} weeks ago`;
  return `${Math.floor(d / 30)} months ago`;
}

/** One candidate's request: local day/time, last hangout, and favorites shared by 2+ members. */
export function decisionRequest(candidate: DecisionCandidate, favoritesByUser: FavoritesByUser): DecisionRequest {
  const timezone = earliestTimezone(candidate.slot.start, Object.values(candidate.group.memberTimezones));
  const local = getLocalParts(candidate.slot.start, timezone);
  const time = `${local.hour % 12 || 12}:${String(local.minute).padStart(2, "0")}${local.hour < 12 ? "am" : "pm"}`;
  const counts = new Map<string, number>();
  for (const userId of candidate.group.memberIds) {
    for (const category of new Set((favoritesByUser.get(userId) ?? []).map((f) => f.category))) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }
  return groupRequest({
    size: candidate.group.memberIds.length,
    when: `${local.weekday} ${time}`,
    lastHangout: lastHangout(candidate.daysSinceLastHangout),
    favorites: [...counts].filter(([, n]) => n >= 2).map(([c]) => c).sort(),
    feasibleVibes: candidate.feasible.map((s) => s.vibe_tag),
  });
}

/** `replies[i]` answers candidate i. Keeps P(A) ≥ 0.6 (every candidate when `force`) and moves each kept one to its chosen vibe's slot. */
export function applyDecisions<T extends DecisionCandidate>(candidates: readonly T[], replies: DecisionResponse[], force: boolean): T[] {
  return candidates.flatMap((candidate, i) => {
    const { answers } = replies[i]!;
    if (!force && (answers.propose?.probabilities.A ?? 0) < PROPOSE_THRESHOLD) return [];
    const vibe = answers.vibe?.choice;
    return [{ ...candidate, slot: candidate.feasible.find((s) => s.vibe_tag === vibe) ?? candidate.slot }];
  });
}

/** Fallback when any decision call fails: only the top-ranked candidate, with its priority vibe. */
export async function scheduleDecisions<T extends DecisionCandidate>(
  candidates: readonly T[],
  favoritesByUser: FavoritesByUser,
  force: boolean,
): Promise<T[]> {
  try {
    const replies = await Promise.all(candidates.map((c) => askDecision(decisionRequest(c, favoritesByUser))));
    return applyDecisions(candidates, replies, force);
  } catch {
    return candidates.slice(0, 1);
  }
}
