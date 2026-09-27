// Owner: Ojas — pure voting rules (plan §9–§10). No DB, no clock.
import type { EventOption, VoteStatus } from "@web/contract";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Voting closes at whichever comes first: opened + timeout, or before the slot:
 * - for events created >= 24 h in advance, voting closes 24 h before the slot;
 * - for events created < 24 h in advance, voting closes 2 h before the slot.
 */
export function voteClosesAt(openedAt: Date, startsAt: Date, timeoutSec: number): Date {
  const advanceMs = startsAt.getTime() - openedAt.getTime();
  const leadBufferMs = advanceMs >= TWENTY_FOUR_HOURS_MS ? TWENTY_FOUR_HOURS_MS : TWO_HOURS_MS;
  return new Date(Math.min(openedAt.getTime() + timeoutSec * 1000, startsAt.getTime() - leadBufferMs));
}

/** Open until the event resolves or its deadline passes, whichever comes first (the sweep can lag the deadline). */
export const votingOpen = (event: { status: string; voteClosesAt: Date }, now: Date): boolean =>
  event.status === "voting" && event.voteClosesAt > now;

/** Any pass (Ghost or visible) counts as responded, so a Ghost Pass looks exactly like a vote. */
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
  | { status: "confirmed"; winner: EventOption & { id: string }; backups: EventOption[]; wasTiebreaker?: boolean };

export function resolveEvent({ participants, votes, options, unusedVenues }: ResolveInput): Resolution {
  const remaining = new Set(participants.filter((p) => p.voteStatus !== "ghost_passed").map((p) => p.userId));
  if (remaining.size < 2) return { status: "expired" };

  const counted = votes.filter((v) => remaining.has(v.userId));
  if (counted.length < 2) return { status: "expired" };

  const tally = new Map<string, number>();
  for (const v of counted) tally.set(v.optionId, (tally.get(v.optionId) ?? 0) + 1);
  // Most votes first; tie → lower route_score; rank keeps it deterministic.
  const ordered = [...options].sort(
    (a, b) => (tally.get(b.id) ?? 0) - (tally.get(a.id) ?? 0) || a.route_score - b.route_score || a.rank - b.rank,
  );
  const [winner, ...losers] = ordered;
  if (!winner) return { status: "chatted" };

  const topVotes = tally.get(winner.id) ?? 0;
  const secondPlaceId = losers[0]?.id;
  const wasTiebreaker = !!secondPlaceId && (tally.get(secondPlaceId) ?? 0) === topVotes && topVotes > 0;

  return { status: "confirmed", winner, backups: [...losers, ...unusedVenues], wasTiebreaker };
}

/** The winner's own time (#321) becomes the event's; options without one keep the event's time. */
export const winnerTime = (winner: EventOption) =>
  winner.starts_at && winner.ends_at ? { startsAt: new Date(winner.starts_at), endsAt: new Date(winner.ends_at) } : {};
