// Riley's deterministic Mixer discovery (#215). The scheduler decides when to call this.
import type { User } from "@prisma/client";
import type { MatchingEvent, MatchingFriendship, CandidateGroup } from "./candidates";
import { groupKey, onCooldown } from "./candidates";

export interface MixerCandidate {
  group: CandidateGroup;
  score: number;
}

/** Find 4–6 person groups connected by accepted, mutual friendships within two hops. */
export function mixerCandidates(
  users: readonly Pick<User, "id" | "timezone">[],
  friendships: readonly MatchingFriendship[],
  events: readonly MatchingEvent[],
  now: Date,
): MixerCandidate[] {
  const zones = new Map(users.map((user) => [user.id, user.timezone]));
  const neighbors = new Map(users.map((user) => [user.id, new Map<string, number>()]));
  for (const friendship of friendships) {
    if (friendship.status !== undefined && friendship.status !== "accepted") continue;
    if (!friendship.lowAddedHigh || !friendship.highAddedLow) continue;
    const { userLowId: low, userHighId: high } = friendship;
    if (low === high || !zones.has(low) || !zones.has(high)) continue;
    neighbors.get(low)!.set(high, friendship.interactionScore);
    neighbors.get(high)!.set(low, friendship.interactionScore);
  }

  // One current voting/confirmed event per person keeps automated invitations from stacking up.
  const busyUsers = new Set(events
    .filter((event) => event.status === "voting" || event.status === "confirmed")
    .flatMap((event) => event.participants.map((participant) => participant.userId)));
  const groups = new Map<string, MixerCandidate>();
  const seen = new Set<string>();

  function connectedWithinTwoHops(ids: readonly string[]): boolean {
    return ids.every((from) => ids.every((to) =>
      from === to || neighbors.get(from)!.has(to) ||
      ids.some((middle) => neighbors.get(from)!.has(middle) && neighbors.get(middle)!.has(to)),
    ));
  }

  function visit(ids: string[]) {
    const key = groupKey(ids);
    if (seen.has(key)) return;
    seen.add(key);
    if (ids.length >= 4 && connectedWithinTwoHops(ids) && !onCooldown(key, events, now)) {
      let interaction = 0;
      let minDegree = Infinity;
      for (const from of ids) {
        const adjacent = ids.filter((to) => to !== from && neighbors.get(from)!.has(to));
        minDegree = Math.min(minDegree, adjacent.length);
        for (const to of adjacent) interaction += neighbors.get(from)!.get(to)!;
      }
      const possiblePairs = ids.length * (ids.length - 1) / 2;
      const score = 0.75 * interaction / (2 * possiblePairs) + 0.25 * minDegree / (ids.length - 1);
      groups.set(key, {
        group: {
          groupKey: key,
          memberIds: ids,
          memberTimezones: Object.fromEntries(ids.map((id) => [id, zones.get(id)!])),
          sourceGroupId: null,
        },
        score,
      });
    }
    if (ids.length === 6) return;
    const adjacent = [...new Set(ids.flatMap((id) => [...neighbors.get(id)!.keys()]))]
      .filter((id) => !ids.includes(id) && !busyUsers.has(id)).sort();
    for (const next of adjacent) visit([...ids, next].sort());
  }

  for (const id of [...zones.keys()].filter((id) => !busyUsers.has(id)).sort()) visit([id]);
  return [...groups.values()].sort((a, b) => b.score - a.score || a.group.groupKey.localeCompare(b.group.groupKey));
}
