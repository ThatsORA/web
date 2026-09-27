// Owner: Andy — shared hrefs for cross-screen buttons.

/** Where the feed's "Add friends" button goes: the Friends tab. */
export const FRIENDS_HREF = "/(main)/friends";

/** Entry point to Settings / You tab from the Hangouts header. */
export const SETTINGS_HREF = "/(main)/you";

/** "Edit profile" on the You tab and Settings (#97). */
export const PROFILE_HREF = "/(main)/profile";

/** "Preferences" on the You tab: the private matching profile (#310). */
export const PREFERENCES_HREF = "/(main)/preferences";

/** The Hangouts feed's "+ New hangout" button. */
export const NEW_HANGOUT_HREF = "/(main)/new-hangout";

/** A chatted card's "Open chat" button: the event's fallback group chat. */
export const CHAT_PATHNAME = "/(main)/chat/[eventId]";

/** Someone's public profile (#97). Friend lists, search, squads and cards link here: router.push(profileHref(id)). */
export const profileHref = (userId: string) => ({ pathname: "/(main)/user/[userId]", params: { userId } }) as const;

