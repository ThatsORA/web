// Riley's deterministic selection step for a manual squad/person hangout (#207).
import type { InviteSource } from "@web/contract";
import type { MatchingFriendship, MatchingGroup } from "./candidates";

type DirectFriendship = Pick<MatchingFriendship, "userLowId" | "userHighId" | "lowAddedHigh" | "highAddedLow" | "status">;

export interface ManualParticipant {
  userId: string;
  inviteSource: InviteSource;
  sourceGroupIds: string[];
}

export type ManualSelection = {
  squadIds: string[];
  participants: ManualParticipant[];
  memberIds: string[];
} | { error: "invalid_squads" | "invalid_invitees" | "invalid_selection" };
export type ResolvedManualSelection = Extract<ManualSelection, { memberIds: string[] }>;

/** Selected squads bring every active member; direct picks must still satisfy the existing friend rule. */
export function resolveManualSelection(
  callerId: string,
  squadIds: readonly string[],
  directIds: readonly string[],
  squads: readonly MatchingGroup[],
  friendships: readonly DirectFriendship[],
): ManualSelection {
  const selectedSquadIds = [...new Set(squadIds)].sort();
  const selectedDirectIds = [...new Set(directIds)].sort();
  const squadsById = new Map(squads.map((squad) => [squad.id, squad]));
  const sources = new Map<string, Set<string>>([[callerId, new Set()]]);

  for (const squadId of selectedSquadIds) {
    const members = squadsById.get(squadId)?.members.filter((member) => member.status === undefined || member.status === "active");
    if (!members?.some((member) => member.userId === callerId)) return { error: "invalid_squads" };
    for (const member of members) {
      const memberSources = sources.get(member.userId) ?? new Set<string>();
      memberSources.add(squadId);
      sources.set(member.userId, memberSources);
    }
  }

  for (const directId of selectedDirectIds) {
    if (directId === callerId) return { error: "invalid_invitees" };
    const [lowId, highId] = [callerId, directId].sort();
    const friendship = friendships.find((row) => row.userLowId === lowId && row.userHighId === highId);
    if (!friendship || (friendship.status !== undefined && friendship.status !== "accepted") ||
      !(callerId === lowId ? friendship.lowAddedHigh : friendship.highAddedLow)) {
      return { error: "invalid_invitees" };
    }
    if (!sources.has(directId)) sources.set(directId, new Set());
  }

  if (sources.size < 2) return { error: "invalid_selection" };
  const memberIds = [...sources.keys()].sort();
  const participants = memberIds.map((userId): ManualParticipant => ({
    userId,
    inviteSource: userId === callerId ? "creator" : sources.get(userId)!.size ? "squad" : "direct",
    sourceGroupIds: [...sources.get(userId)!].sort(),
  }));
  return { squadIds: selectedSquadIds, memberIds, participants };
}
