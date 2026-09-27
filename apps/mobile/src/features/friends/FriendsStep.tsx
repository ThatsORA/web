// Owner: Ojas — onboarding step 5: search + send friend requests, then star any accepted close friends.
// Copy explains that close friends are completely private.
import { useState } from "react";
import { View } from "react-native";
import { displayName } from "../../lib/displayName";
import { stepEyebrow, type OnboardingStepProps } from "../../lib/onboarding";
import { Button, Chip, Screen, Txt, useTheme } from "../../ui";
import { FriendSearch } from "./FriendSearch";
import { type Friend } from "./friendsApi";
import { useFriendsData } from "./useFriendsData";

export function FriendsStep({ onDone }: OnboardingStepProps) {
  const t = useTheme();
  const { friends, requests, refresh, toggleClose } = useFriendsData();
  const [hasActed, setHasActed] = useState(false);

  function handleToggleClose(f: Friend) {
    setHasActed(true);
    void toggleClose(f);
  }

  function handleRefresh() {
    setHasActed(true);
    void refresh();
  }

  const hasCloseFriends = friends.some((f) => f.close);
  const doneLabel = hasActed || hasCloseFriends || requests.outgoing.length > 0 ? "Done" : "Skip for now";

  return (
    <Screen
      eyebrow={stepEyebrow("friends")}
      title="Add friends"
      subtitle="Search by username to send friend requests, then star any friends who have already accepted. Close friends are completely private — nobody knows who you star."
      footer={
        <Button
          label={doneLabel}
          variant={doneLabel === "Done" ? "primary" : "ghost"}
          onPress={onDone}
        />
      }
    >
      <FriendSearch friends={friends} requests={requests} onRefresh={handleRefresh} />

      {friends.length > 0 ? (
        <View style={{ gap: t.spacing.sm, marginTop: t.spacing.md }}>
          <Txt variant="section">Star close friends</Txt>
          <View style={{ gap: t.spacing.sm }}>
            {friends.map((f) => (
              <View
                key={f.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: t.spacing.sm,
                  paddingVertical: t.spacing.xs,
                }}
              >
                <View style={{ flexShrink: 1 }}>
                  <Txt variant="body">{displayName(f)}</Txt>
                  <Txt variant="small">@{f.username}</Txt>
                </View>
                <Chip
                  label={f.close ? "★ Close" : "☆ Close"}
                  selected={f.close}
                  onPress={() => void handleToggleClose(f)}
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
