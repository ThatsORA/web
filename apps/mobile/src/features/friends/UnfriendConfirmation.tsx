import { View } from "react-native";
import { displayName } from "../../lib/displayName";
import { Button, Card, Txt, useTheme } from "../../ui";
import type { Friend } from "./friendsApi";

export function UnfriendConfirmation({ friend, busy, onCancel, onConfirm }: {
  friend: Friend;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTheme();
  return (
    <Card>
      <Txt variant="section">Unfriend {displayName(friend)}?</Txt>
      <Txt variant="small">This removes your friendship and close-friend status.</Txt>
      <View style={{ flexDirection: "row", gap: t.spacing.sm }}>
        <Button label="Cancel" variant="outline" onPress={onCancel} disabled={busy} />
        <Button label="Unfriend" onPress={onConfirm} loading={busy} />
      </View>
    </Card>
  );
}
