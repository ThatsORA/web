// Owner: Ojas — Squad membership rules (#76). Collective consent, kept as simple as it gets:
//   1. The invitee must accept.
//   2. In a squad that already has 3+ active members, any active member can object (remove the
//      invite) within 24 h of it being sent. An accepted invite becomes active once that window passes.
// Smaller squads (1–2 active) skip the window: the inviter's say plus the invitee's yes is everyone.
export const MAX_MEMBERS = 6; // active + invited
export const CONSENT_QUORUM = 3;
export const OBJECTION_WINDOW_MS = 24 * 3_600_000;

export interface Membership {
  status: "invited" | "active";
  invitedAt: Date | null;
  acceptedAt: Date | null;
}

/** Can `adding` more people be invited into a squad that has `members` (active + invited)? */
export const hasRoom = (members: number, adding: number) => members + adding <= MAX_MEMBERS;

/** When an accepted invite may become active. */
export const joinsAt = (m: Membership) => new Date((m.invitedAt ?? new Date(0)).getTime() + OBJECTION_WINDOW_MS);

/** The invitee said yes: active now, or still waiting out the objection window? */
export function onAccept(m: Membership, activeCount: number, now: Date): "active" | "waiting" {
  return activeCount < CONSENT_QUORUM || now >= joinsAt(m) ? "active" : "waiting";
}

/** An accepted invite whose objection window has passed (the sweep promotes these). */
export const isDue = (m: Membership, now: Date) => m.status === "invited" && m.acceptedAt !== null && now >= joinsAt(m);

/** What a member sees for someone's `joins_at`: only set while an accepted invite waits out the window. */
export const visibleJoinsAt = (m: Membership) => (m.status === "invited" && m.acceptedAt ? joinsAt(m) : null);
