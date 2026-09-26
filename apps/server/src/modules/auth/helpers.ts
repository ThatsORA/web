// Owner: Ojas — pure auth/profile helpers.
import { Prisma, type User } from "@prisma/client";
import type { Me } from "@web/contract";
import type { z } from "zod";
import { env } from "../../env";

type MeT = z.infer<typeof Me>;

/** Home coords are stored rounded to 3 decimals (~110 m). Avoids -0. */
export function roundCoord(value: number): number {
  const r = Math.round(value * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

/** Duplicate email/username (unique constraint) → 409, anything else is a real failure. */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** The only shape a user leaves the server in: never includes password_hash. */
export function toMe(user: User): MeT {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    timezone: user.timezone,
    home_lat: user.homeLat,
    home_lng: user.homeLng,
    travel_mode: user.travelMode as MeT["travel_mode"],
    email_verified: isFindable(user), // true for everyone when verification is off, so the app skips the step
    display_name: user.displayName,
    bio: user.bio,
  };
}

/** The only shape another user leaves the server in: no email, no close-friend status. */
export const publicUserSelect = { id: true, username: true, displayName: true } as const;
export const toPublicUser = (u: { id: string; username: string; displayName?: string | null }) => ({
  id: u.id,
  username: u.username,
  display_name: u.displayName ?? u.username,
});

export const USERNAME_COOLDOWN_MS = 30 * 24 * 3_600_000;
/** When this user may change their username again, or null if they can now. */
export function usernameRetryAt(changedAt: Date | null, now: Date): Date | null {
  if (!changedAt) return null;
  const next = new Date(changedAt.getTime() + USERNAME_COOLDOWN_MS);
  return next > now ? next : null;
}

// While verification is required, unverified accounts can't be found or befriended, so they can
// never join a mutual pair and never reach the matcher.
/** Prisma `where` for users others may find. */
export const findableWhere = () => (env.EMAIL_VERIFICATION_REQUIRED ? { emailVerifiedAt: { not: null } } : {});
export const isFindable = (user: { emailVerifiedAt: Date | null }) => !env.EMAIL_VERIFICATION_REQUIRED || user.emailVerifiedAt !== null;
