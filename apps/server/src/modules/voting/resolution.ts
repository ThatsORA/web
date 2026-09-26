// Owner: Ojas — pure voting rules (plan §9–§10). No DB, no clock.
import type { EventOption, VoteStatus } from "@web/contract";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/** Voting closes at whichever comes first: opened + timeout, or 2 h before the slot. */
export function voteClosesAt(openedAt: Date, startsAt: Date, timeoutSec: number): Date {
  return new Date(Math.min(openedAt.getTime() + timeoutSec * 1000, startsAt.getTime() - TWO_HOURS_MS));
}

/** A ghost pass counts as responded, so it looks exactly like a vote. */
export function progress(statuses: readonly VoteStatus[]) {
  return { responded: statuses.filter((s) => s !== "invited").length, total: statuses.length };
}

export interface ResolveInput {
  participants: readonly { userId: string; voteStatus: VoteStatus }[];
  votes: readonly { userId: string; optionId: string }[];
  options: readonly (EventOption & { id: string })[];
  /** Ranked venues the matcher didn't use as options (the rest of the top 5). */
  unusedVenues: readonly EventOption[];
}

export type Resolution =
  | { status: "expired" }
  | { status: "chatted" }
  | { status: "confirmed"; winner: EventOption & { id: string }; backups: EventOption[] };

export function resolveEvent({ participants, votes, options, unusedVenues }: ResolveInput): Resolution {
  const remaining = new Set(participants.filter((p) => p.voteStatus !== "ghost_passed").map((p) => p.userId));
  if (remaining.size < 2) return { status: "expired" };

  const counted = votes.filter((v) => remaining.has(v.userId));
  if (counted.length < 2) return { status: "chatted" };

  const tally = new Map<string, number>();
  for (const v of counted) tally.set(v.optionId, (tally.get(v.optionId) ?? 0) + 1);
  // Most votes first; tie → lower route_score; rank keeps it deterministic.
  const ordered = [...options].sort(
    (a, b) => (tally.get(b.id) ?? 0) - (tally.get(a.id) ?? 0) || a.route_score - b.route_score || a.rank - b.rank,
  );
  const [winner, ...losers] = ordered;
  if (!winner) return { status: "chatted" };
  return { status: "confirmed", winner, backups: [...losers, ...unusedVenues] };
}
