// Owner: Andy — pure logic for the "+ New hangout" screen (#70, #363): who's invited,
// the this/next week range, and the POST /events body. No React Native.
import { CreateEventRequest, type VibeTag } from "@web/contract";
import { ApiError } from "./api";

export type Week = "this" | "next";

export type SquadMemberLike = { id: string; username?: string; display_name?: string | null; status?: string };
export type SquadLike = { id: string; name: string; members: SquadMemberLike[] };

export interface DeduplicatedInviteesResult {
  inviteeIds: string[];
  squadMemberIds: string[];
  /** At least one person besides me: the server needs someone to schedule against. */
  canSubmit: boolean;
}

/**
 * Deduplicates invitees selected via squads and direct individual friend picks.
 * Overlap between squads and individual picks is counted once.
 * The creator (caller) is never an invitee.
 */
export function getDeduplicatedInvitees(
  selectedSquadIds: string[],
  selectedPersonIds: string[],
  squads: SquadLike[],
  creatorId?: string | null,
): DeduplicatedInviteesResult {
  const squadMemberIdSet = new Set<string>();
  const selectedSquadSet = new Set(selectedSquadIds);

  for (const squad of squads) {
    if (selectedSquadSet.has(squad.id)) {
      for (const member of squad.members) {
        const isActive = !member.status || member.status === "active";
        if (isActive && member.id !== creatorId) {
          squadMemberIdSet.add(member.id);
        }
      }
    }
  }

  const directPersonIdSet = new Set<string>();
  for (const personId of selectedPersonIds) {
    if (personId !== creatorId) {
      directPersonIdSet.add(personId);
    }
  }

  const inviteeIds = Array.from(new Set([...squadMemberIdSet, ...directPersonIdSet]));

  return {
    inviteeIds,
    squadMemberIds: Array.from(squadMemberIdSet),
    canSubmit: inviteeIds.length >= 1,
  };
}

/** Returns details for selected squads and their active members (excluding creator). */
export function getSelectedSquadMembers<T extends SquadMemberLike, S extends { id: string; name: string; members: T[] }>(
  selectedSquadIds: string[],
  squads: S[],
  creatorId?: string | null,
): { squad: S; activeMembers: T[] }[] {
  const selectedSquadSet = new Set(selectedSquadIds);
  return squads
    .filter((squad) => selectedSquadSet.has(squad.id))
    .map((squad) => ({
      squad,
      activeMembers: squad.members.filter((m) => (!m.status || m.status === "active") && m.id !== creatorId),
    }));
}

/**
 * Monday-start weeks in the phone's local time, sent as instants.
 * "this": now until next Monday 00:00. "next": next Monday 00:00 until the Monday after.
 */
export function weekRange(week: Week, now: Date): { earliest: string; latest: string } {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7)); // next Monday 00:00
  const start = week === "this" ? now : monday;
  const end = new Date(monday);
  if (week === "next") end.setDate(end.getDate() + 7);
  return { earliest: start.toISOString(), latest: end.toISOString() };
}

/** "Try a different week": this ↔ next; "any time" (the default horizon) moves to next week. */
export const otherWeek = (week: Week | null): Week => (week === "next" ? "this" : "next");

export function buildCreateEventRequest(
  input: { inviteeIds: string[]; squadIds?: string[]; vibe: VibeTag | null; week: Week | null },
  now: Date,
): CreateEventRequest {
  return CreateEventRequest.parse({
    invitee_ids: input.inviteeIds,
    ...(input.squadIds && input.squadIds.length > 0 ? { squad_ids: input.squadIds } : {}),
    ...(input.vibe ? { vibe_tag: input.vibe } : {}),
    ...(input.week ? weekRange(input.week, now) : {}),
  });
}

/**
 * POST /events answers 422 `no_common_time` when the group has no shared free window, and
 * 422 `no_venues` when someone has no home location or too few places are nearby.
 */
export function noMatchReason(e: unknown): "no_common_time" | "no_venues" | null {
  if (!(e instanceof ApiError) || e.status !== 422) return null;
  const error = (e.body as { error?: unknown } | null)?.error;
  return error === "no_common_time" || error === "no_venues" ? error : null;
}
