// Owner: Andy — which friend button a public profile shows (#97). Pure, so it's unit-tested.
// Privacy: reads only the visible request/accept state. Close-friend status is never shown.
import type { FriendshipState } from "@web/contract";
import type { z } from "zod";

export type FriendAction = {
  label: string;
  variant: "primary" | "outline";
  /** "send" also accepts: sending a request to someone who already asked me accepts theirs. */
  kind: "send" | "cancel";
};

/** The button for a profile, or null when there's nothing to tap (my own profile, or already friends). */
export function friendAction(state: z.infer<typeof FriendshipState>, isSelf: boolean): FriendAction | null {
  if (isSelf) return null;
  switch (state) {
    case "none":
      return { label: "Add friend", variant: "primary", kind: "send" };
    case "requested":
      return { label: "Requested · tap to cancel", variant: "outline", kind: "cancel" };
    case "incoming":
      return { label: "Accept friend request", variant: "primary", kind: "send" };
    case "friends":
      return null;
  }
}
