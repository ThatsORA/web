// Owner: Ojas — the propose gate + vibe choice for the matcher (#231, #196).
// One askDecision call per run: propose_<i> (A = suggest now) and vibe_<i> (among that window's
// feasible vibes). Facts are plain words: no names, emails, ids or raw timestamps leave the server.
import type { RankedGroupSlot } from "../matching/candidates";
import { earliestTimezone, getLocalParts, type ClassifiedSlot } from "../matching/timeMath";
import { askDecision, proposeQuestion, vibeQuestion, type DecisionQuestions, type DecisionResponse } from "./decision";

export const PROPOSE_THRESHOLD = 0.6;
const STATE = "A friend-hangout app is deciding which friend groups to suggest a hangout to, and what kind.";

export interface DecisionCandidate extends RankedGroupSlot {
  /** Every feasible slot of the candidate's free window (feasibleSlots); `slot` is the priority pick. */
  feasible: ClassifiedSlot[];
}

type FavoritesByUser = ReadonlyMap<string, readonly { category: string }[]>;

function lastHangout(days: number | null): string {
  if (days === null) return "never";
  if (days < 7) return "this week";
  if (days <= 14) return "1–2 weeks ago";
  return "over 2 weeks ago";
}

/** Plain-word facts, e.g. ["group of 3 friends", "free time: Fri 7:00pm", "last hangout: never"]. */
export function candidateFacts(candidate: RankedGroupSlot, favoritesByUser: FavoritesByUser): string[] {
  const timezone = earliestTimezone(candidate.slot.start, Object.values(candidate.group.memberTimezones));
  const local = getLocalParts(candidate.slot.start, timezone);
  const time = `${local.hour % 12 || 12}:${String(local.minute).padStart(2, "0")}${local.hour < 12 ? "am" : "pm"}`;
  const counts = new Map<string, number>();
  for (const userId of candidate.group.memberIds) {
    for (const category of new Set((favoritesByUser.get(userId) ?? []).map((f) => f.category))) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }
  const shared = [...counts].filter(([, n]) => n >= 2).map(([c]) => c.replaceAll("_", " ")).sort();
  const facts = [
    `group of ${candidate.group.memberIds.length} friends`,
    `free time: ${local.weekday} ${time}`,
    `last hangout: ${lastHangout(candidate.daysSinceLastHangout)}`,
  ];
  if (shared.length) facts.push(`shared favorites: ${shared.join(", ")}`);
  return facts;
}

/** propose_<i> for every candidate; vibe_<i> only when its window has more than one feasible vibe. */
export function decisionQuestions(candidates: readonly DecisionCandidate[], favoritesByUser: FavoritesByUser): DecisionQuestions {
  const questions: DecisionQuestions = {};
  candidates.forEach((candidate, i) => {
    const facts = candidateFacts(candidate, favoritesByUser);
    questions[`propose_${i}`] = proposeQuestion(facts);
    const vibes = candidate.feasible.map((s) => s.vibe_tag);
    if (vibes.length > 1) questions[`vibe_${i}`] = vibeQuestion(facts, vibes);
  });
  return questions;
}

/** Keeps P(A) ≥ 0.6 (every candidate when `force`) and moves each kept one to its chosen vibe's slot. */
export function applyDecisions(candidates: readonly DecisionCandidate[], res: DecisionResponse, force: boolean): DecisionCandidate[] {
  return candidates.flatMap((candidate, i) => {
    if (!force && (res.answers[`propose_${i}`]?.probabilities.A ?? 0) < PROPOSE_THRESHOLD) return [];
    const vibe = res.answers[`vibe_${i}`]?.choice;
    return [{ ...candidate, slot: candidate.feasible.find((s) => s.vibe_tag === vibe) ?? candidate.slot }];
  });
}

/** Fallback when the decision call fails: only the top-ranked candidate, with its priority vibe. */
export async function scheduleDecisions(
  candidates: readonly DecisionCandidate[],
  favoritesByUser: FavoritesByUser,
  force: boolean,
): Promise<DecisionCandidate[]> {
  if (!candidates.length) return [];
  try {
    return applyDecisions(candidates, await askDecision(STATE, decisionQuestions(candidates, favoritesByUser)), force);
  } catch {
    return candidates.slice(0, 1);
  }
}
