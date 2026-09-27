// Owner: Andy — the one label for a person anywhere in the app (#211). Pure, no React Native.

/**
 * The name people see: their display name, or their username when they haven't set one.
 * Takes Me (display_name null until set), PublicUser (the server already falls back) and
 * payloads with no display_name at all (chat messages today).
 */
export function displayName(user: { username: string; display_name?: string | null }): string {
  return user.display_name?.trim() || user.username;
}
