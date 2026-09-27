// Owner: Andy — My profile (#97): pure helpers for the edit screen. No React Native.
import { ApiError as ApiErrorBody, Bio, ChangeEmailRequest, DisplayName, Instant, Me, PatchMeRequest, Username } from "@web/contract";
import { z } from "zod";
import { ApiError } from "./api";

type MeData = z.infer<typeof Me>;
type Patch = z.infer<typeof PatchMeRequest>;

export const BIO_MAX = 160;
export const USERNAME_RULE = "3–24 lowercase letters, numbers or _. You can change it once every 30 days.";

/**
 * The PATCH /me body for the name + bio form: only fields that changed. A blank field clears it (null).
 * `patch` is null when nothing changed; `errors` are per-field messages from the contract schemas.
 */
export function buildProfilePatch(
  me: Pick<MeData, "display_name" | "bio">,
  draft: { displayName: string; bio: string },
): { patch: Patch | null; errors: { displayName?: string; bio?: string } } {
  const errors: { displayName?: string; bio?: string } = {};
  const patch: Patch = {};

  const name = draft.displayName.trim();
  if (name === "") {
    if (me.display_name !== null) patch.display_name = null;
  } else if (!DisplayName.safeParse(name).success) {
    errors.displayName = "Display name is at most 40 characters.";
  } else if (name !== me.display_name) {
    patch.display_name = name;
  }

  const bio = draft.bio.trim();
  if (bio === "") {
    if (me.bio !== null) patch.bio = null;
  } else if (!Bio.safeParse(bio).success) {
    errors.bio = `Bio is at most ${BIO_MAX} characters.`;
  } else if (bio !== me.bio) {
    patch.bio = bio;
  }

  const empty = Object.keys(patch).length === 0;
  return { patch: empty || errors.displayName || errors.bio ? null : patch, errors };
}

export const PREF_MAX = 300; // PrefText in the contract; the fields cap input at this

/** The PATCH /me body for the Preferences form (#310): only fields that changed, blank clears (null). Null when nothing changed. */
export function buildPrefsPatch(
  me: Pick<MeData, "pref_activities" | "pref_personality">,
  draft: { activities: string; personality: string },
): Patch | null {
  const patch: Patch = {};
  const activities = draft.activities.trim() || null;
  const personality = draft.personality.trim() || null;
  if (activities !== me.pref_activities) patch.pref_activities = activities;
  if (personality !== me.pref_personality) patch.pref_personality = personality;
  return Object.keys(patch).length ? patch : null;
}

/** Message for an invalid username draft, or null when it's valid. */
export function usernameProblem(draft: string): string | null {
  return Username.safeParse(draft).success ? null : "Usernames are 3–24 lowercase letters, numbers or _.";
}

/** The POST /me/email body, normalized like sign-up (trimmed, lowercased), or null if the email isn't valid. */
export function buildChangeEmailRequest(newEmail: string, password: string): z.infer<typeof ChangeEmailRequest> | null {
  const parsed = ChangeEmailRequest.safeParse({ new_email: newEmail.trim().toLowerCase(), password });
  return parsed.success && password.length > 0 ? parsed.data : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const CooldownBody = z.object({ retry_at: Instant }); // 409 username_cooldown extra field (not in the contract yet)

/** User-facing message for a failed profile request (PATCH /me, POST /me/email, POST /me/email/confirm). */
export function profileErrorMessage(e: unknown, now: Date = new Date()): string {
  if (!(e instanceof ApiError)) return "Couldn't reach the server. Try again.";
  const code = ApiErrorBody.safeParse(e.body).data?.error;
  switch (code) {
    case "username_taken":
      return "That username is taken. Try another.";
    case "username_cooldown": {
      const retry = CooldownBody.safeParse(e.body);
      if (!retry.success) return "You can change your username once every 30 days.";
      const days = Math.max(1, Math.ceil((Date.parse(retry.data.retry_at) - now.getTime()) / DAY_MS));
      return `You can change your username once every 30 days. Try again in ${days} ${days === 1 ? "day" : "days"}.`;
    }
    case "invalid_credentials":
      return "That password isn't right.";
    case "same_email":
      return "That's already your email.";
    case "email_taken":
      return "That email is already in use by another account.";
    case "cooldown":
      return "We just sent a code. Wait a minute before asking for another.";
    case "wrong_code":
      return "That code isn't right. Check the email and try again.";
    case "code_expired":
      return "That code has expired or been used up. Send a new one.";
    case "invalid_body":
      return "Check what you entered and try again.";
  }
  return "Something went wrong. Try again.";
}
