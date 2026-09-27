// Owner: Riley. Internal matcher inputs; persistence stays in the worker (#10).
import type { Friendship, User, ExplicitGroup, GroupMember, Event, EventParticipant } from "@prisma/client";
import type { EventStatus } from "@web/contract";
import type { ClassifiedSlot } from "./timeMath";
import { env } from "../../env";

export type MatchingFriendship = Pick<Friendship, "userLowId" | "userHighId" | "lowAddedHigh" | "highAddedLow" | "interactionScore" | "lastHangoutAt"> & { status?: string };
export type MatchingGroup = Pick<ExplicitGroup, "id"> & { members: (Pick<GroupMember, "userId"> & { status?: string })[] };
export type MatchingEvent = Pick<Event, "groupKey" | "startsAt" | "endsAt" | "resolvedAt"> & {
  status: EventStatus;
  participants: Pick<EventParticipant, "userId">[];
};
export interface CandidateGroup {
  groupKey: string;
  memberIds: string[];
  memberTimezones: Record<string, string>;
  sourceGroupId: string | null;
}
export interface GroupSlot {
  group: CandidateGroup;
  slot: ClassifiedSlot;
}
export interface RankedGroupSlot extends GroupSlot {
  daysSinceLastHangout: number | null;
  staleness: number;
  soonness: number;
  score: number;
}
const HOUR = 3_600_000;
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export const groupKey = (ids: readonly string[]) => [...new Set(ids)].sort(lexical).join(",");

/** Mutual pairs, maximal mutual cliques, explicit groups and one-drop subsets (not recursive). */
export function candidateGroups(
  users: readonly Pick<User, "id" | "timezone">[],
  friendships: readonly MatchingFriendship[],
  explicitGroups: readonly MatchingGroup[] = [],
): CandidateGroup[] {
  const zones = new Map(users.map(user => [user.id, user.timezone]));
  const neighbors = new Map(users.map(user => [user.id, new Set<string>()]));
  for (const edge of friendships) {
    if (!edge.lowAddedHigh || !edge.highAddedLow || edge.userLowId === edge.userHighId) continue;
    if (edge.status !== undefined && edge.status !== "accepted") continue;
    if (!neighbors.has(edge.userLowId) || !neighbors.has(edge.userHighId)) continue;
    neighbors.get(edge.userLowId)!.add(edge.userHighId);
    neighbors.get(edge.userHighId)!.add(edge.userLowId);
  }
  const groups = new Map<string, CandidateGroup>();
  function add(ids: string[], sourceGroupId: string | null) {
    const memberIds = [...new Set(ids)].sort(lexical);
    if (memberIds.length < 3 || memberIds.length > 6) return;
    if (memberIds.some(id => !zones.has(id))) return;
    const key = groupKey(memberIds);
    const memberTimezones = Object.fromEntries(memberIds.map(id => [id, zones.get(id)!]));
    if (!groups.has(key)) groups.set(key, { groupKey: key, memberIds, memberTimezones, sourceGroupId });
  }
  function addFamily(ids: string[], sourceGroupId: string | null) {
    const unique = [...new Set(ids)];
    add(unique, sourceGroupId);
    if (unique.length >= 4 && unique.length <= 7) {
      for (const dropped of unique) add(unique.filter(id => id !== dropped), sourceGroupId);
    }
  }
  // Explicit provenance wins deduplication; ID order makes it independent of DB order.
  for (const group of [...explicitGroups].sort((a, b) => lexical(a.id, b.id))) {
    const activeMembers = group.members.filter(member => member.status === undefined || member.status === "active");
    if (activeMembers.length < 2) continue;
    addFamily(activeMembers.map(member => member.userId), group.id);
  }
  for (const edge of friendships) {
    if (!edge.lowAddedHigh || !edge.highAddedLow || edge.userLowId === edge.userHighId) continue;
    if (edge.status !== undefined && edge.status !== "accepted") continue;
    const memberIds = [edge.userLowId, edge.userHighId].sort(lexical);
    if (memberIds.some(id => !zones.has(id))) continue;
    const key = groupKey(memberIds);
    const memberTimezones = Object.fromEntries(memberIds.map(id => [id, zones.get(id)!]));
    groups.set(key, { groupKey: key, memberIds, memberTimezones, sourceGroupId: null });
  }
  function bronKerbosch(r: string[], p: Set<string>, x: Set<string>) {
    if (!p.size && !x.size) { addFamily(r, null); return; }
    const pivot = [...p, ...x].sort((a, b) =>
      [...p].filter(id => neighbors.get(b)!.has(id)).length -
      [...p].filter(id => neighbors.get(a)!.has(id)).length || lexical(a, b))[0];
    for (const v of [...p].filter(id => !pivot || !neighbors.get(pivot)!.has(id)).sort(lexical)) {
      const adjacent = neighbors.get(v)!;
      bronKerbosch([...r, v], new Set([...p].filter(id => adjacent.has(id))), new Set([...x].filter(id => adjacent.has(id))));
      p.delete(v);
      x.add(v);
    }
  }
  bronKerbosch([], new Set([...neighbors.keys()].sort(lexical)), new Set());
  return [...groups.values()].sort((a, b) => lexical(a.groupKey, b.groupKey));
}

/** Cooldown starts at resolution, not the proposed hangout's scheduled end. */
export function onCooldown(key: string, events: readonly MatchingEvent[], now: Date, cooldownHours = env.COOLDOWN_HOURS): boolean {
  return cooldownHours > 0 && events.some(event => event.groupKey === key &&
    (event.status === "expired" || event.status === "chatted") && event.resolvedAt !== null &&
    now.getTime() < event.resolvedAt.getTime() + cooldownHours * HOUR);
}

/** Closeness is deferred (#320, plan §5): the score is staleness and soonness only. */
export function rankCandidates(candidates: readonly GroupSlot[], friendships: readonly MatchingFriendship[], now: Date): RankedGroupSlot[] {
  const pairs = new Map(friendships.map(edge => [groupKey([edge.userLowId, edge.userHighId]), edge]));
  return candidates.map(candidate => {
    let lastHangout: number | null = null;
    const ids = candidate.group.memberIds;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const pair = pairs.get(groupKey([ids[i]!, ids[j]!]));
        if (pair?.lastHangoutAt) lastHangout = Math.max(lastHangout ?? -Infinity, pair.lastHangoutAt.getTime());
      }
    }
    // Most recent pair hangout is the conservative group recency estimate.
    const daysSinceLastHangout = lastHangout === null ? null : Math.max((now.getTime() - lastHangout) / (24 * HOUR), 0);
    const staleness = daysSinceLastHangout === null ? 1 : Math.min(daysSinceLastHangout, 14) / 14;
    const soonness = 1 - (candidate.slot.start.getTime() - now.getTime()) / (168 * HOUR);
    const score = 0.6 * staleness + 0.4 * soonness;
    return { ...candidate, daysSinceLastHangout, staleness, soonness, score };
  }).sort((a, b) => b.score - a.score || a.slot.start.getTime() - b.slot.start.getTime() || lexical(a.group.groupKey, b.group.groupKey));
}

/** Rank then reserve each selection, so candidates cannot conflict with each other. */
export function selectCandidates(candidates: readonly GroupSlot[], friendships: readonly MatchingFriendship[], events: readonly MatchingEvent[], now: Date, cooldownHours = env.COOLDOWN_HOURS): RankedGroupSlot[] {
  return selectRankedCandidates(rankCandidates(candidates, friendships, now), events, now, cooldownHours);
}

/** Apply skip rules in the supplied order, reserving members as candidates are selected. */
export function selectRankedCandidates<T extends RankedGroupSlot>(
  candidates: readonly T[],
  events: readonly MatchingEvent[],
  now: Date,
  cooldownHours = env.COOLDOWN_HOURS,
): T[] {
  const occupied = events.filter(event => event.status === "voting" || event.status === "confirmed");
  const selected: T[] = [];
  for (const candidate of candidates) {
    const { group, slot } = candidate;
    if (onCooldown(group.groupKey, events, now, cooldownHours)) continue;
    if (occupied.some(event => event.groupKey === group.groupKey ||
      (slot.start < event.endsAt && event.startsAt < slot.end && event.participants.some(member => group.memberIds.includes(member.userId))))) continue;
    selected.push(candidate);
    occupied.push({ groupKey: group.groupKey, startsAt: slot.start, endsAt: slot.end, status: "voting", resolvedAt: null, participants: group.memberIds.map(userId => ({ userId })) });
  }
  return selected;
}
