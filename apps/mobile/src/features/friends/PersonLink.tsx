// Owner: Ojas — a person in a list row: their name, with @username under it for telling people
// apart and for search (#211); tapping it opens their profile (#185).
// A sibling of the row's buttons (not a wrapper), so Add/Accept/star never also open the profile.
import type { PublicUser } from "@web/contract";
import { router } from "expo-router";
import { Pressable } from "react-native";
import { displayName } from "../../lib/displayName";
import { profileHref } from "../../lib/routes";
import { Txt, useTheme } from "../../ui";

export function PersonLink({ user }: { user: PublicUser }) {
  const t = useTheme();
  const name = displayName(user);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open ${name}'s profile, @${user.username}`}
      onPress={() => router.push(profileHref(user.id))}
      style={{ minHeight: t.touch, justifyContent: "center", flexShrink: 1 }}
    >
      <Txt variant="body" color="link">
        {name}
      </Txt>
      <Txt variant="small">@{user.username}</Txt>
    </Pressable>
  );
}
