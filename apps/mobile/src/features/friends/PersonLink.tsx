// Owner: Ojas — a person's @username in a list row; tapping it opens their profile (#185).
// A sibling of the row's buttons (not a wrapper), so Add/Accept/star never also open the profile.
import { router } from "expo-router";
import { Pressable } from "react-native";
import { profileHref } from "../../lib/routes";
import { Txt, useTheme } from "../../ui";

export function PersonLink({ id, username }: { id: string; username: string }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open @${username}'s profile`}
      onPress={() => router.push(profileHref(id))}
      style={{ minHeight: t.touch, justifyContent: "center", flexShrink: 1 }}
    >
      <Txt variant="body" color="link">
        @{username}
      </Txt>
    </Pressable>
  );
}
