// Owner: Ojas — a person's avatar and @username in a list row; tapping it opens their profile (#185).
// A sibling of the row's buttons (not a wrapper), so Add/Accept/star never also open the profile.
import { router } from "expo-router";
import { Pressable } from "react-native";
import { profileHref } from "../../lib/routes";
import { Avatar, Txt, useTheme } from "../../ui";

export function PersonLink({ id, username }: { id: string; username: string }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open @${username}'s profile`}
      onPress={() => router.push(profileHref(id))}
      style={{ minHeight: t.touch, flexDirection: "row", alignItems: "center", gap: t.spacing.sm, flexShrink: 1 }}
    >
      <Avatar name={username} size="sm" />
      <Txt variant="body" color="link">
        @{username}
      </Txt>
    </Pressable>
  );
}
