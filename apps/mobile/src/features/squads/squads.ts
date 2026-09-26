// Owner: Ojas — pure view logic for the Squads screen (#76). No React Native.
import type { Friend, Squad, SquadMember } from "@web/contract";
import type { z } from "zod";

export type SquadT = z.infer<typeof Squad>;
export type FriendT = z.infer<typeof Friend>;
type MemberT = z.infer<typeof SquadMember>;

/** Squads I've been invited to (answer these) vs squads I'm in. */
export function splitSquads(squads: SquadT[]) {
  return { invites: squads.filter((s) => s.my_status === "invited"), mine: squads.filter((s) => s.my_status === "active") };
}

/** I said yes to this invite and am waiting out the 24 h objection window. */
export const isWaiting = (squad: SquadT, me: string | null) =>
  squad.members.some((m) => m.id === me && m.status === "invited" && m.joins_at !== null);

/** Friends who aren't in this squad yet (or all friends, for a new squad). */
export const invitable = (friends: FriendT[], squad?: SquadT) =>
  friends.filter((f) => !squad?.members.some((m) => m.id === f.id));

/** The badge next to a member, or null for active members. */
export function memberBadge(m: MemberT, now: Date): string | null {
  if (m.status === "active") return null;
  if (!m.joins_at) return "Invited";
  const hours = Math.max(1, Math.ceil((Date.parse(m.joins_at) - now.getTime()) / 3_600_000));
  return `Joins in ${hours}h`;
}

const MESSAGES: Record<string, string> = {
  not_friends: "You can only invite people who are your friends.",
  already_member: "They're already in this squad.",
  squad_full: "Squads hold up to 6 people.",
  invalid_invitees: "Pick at least one friend.",
};

/** User-facing message for a failed squad action. `error` is the server's `{ error }` code, if any. */
export const squadErrorMessage = (error: unknown) =>
  (typeof error === "string" && MESSAGES[error]) || "Couldn't reach the server. Try again.";
