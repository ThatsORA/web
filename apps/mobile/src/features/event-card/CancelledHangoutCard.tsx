// Owner: Andy — in-feed notification card for recently cancelled/expired hangouts.
import type { EventCardPayload } from "@web/contract";
import { SymbolView } from "expo-symbols";
import { Pressable, View } from "react-native";
import { Card, Callout, Txt, useTheme } from "../../ui";

export type CancelledHangoutCardProps = {
  card?: EventCardPayload;
  explanation?: string;
  onDismiss: () => void;
};

/**
 * Returns the appropriate explanation string for a cancelled hangout.
 * Defaults to "Minimum 2 people required" or "Not enough responses received".
 */
export function getCancelledExplanation(card?: EventCardPayload): string {
  if (!card) return "Not enough responses received";

  const cardWithReason = card as unknown as { cancellation_reason?: string };
  if (cardWithReason.cancellation_reason) {
    return cardWithReason.cancellation_reason;
  }

  // Count participants who haven't passed
  const activeParticipants = card.participants?.filter((p) => !p.passed) ?? [];
  if (activeParticipants.length < 2) {
    return "Minimum 2 people required";
  }

  if (card.progress && card.progress.responded < card.progress.total) {
    return "Not enough responses received";
  }

  return "Minimum 2 people required";
}

export function CancelledHangoutCard({ card, explanation, onDismiss }: CancelledHangoutCardProps) {
  const t = useTheme();
  const reasonText = explanation ?? getCancelledExplanation(card);

  return (
    <Card tint>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, gap: t.spacing.xs }}>
          <Txt variant="headline" accessibilityRole="header">
            Hangout Cancelled
          </Txt>
          {card?.participants && card.participants.length > 0 ? (
            <Txt variant="small">
              {card.participants.map((p) => p.display_name ?? p.username).join(" · ")}
            </Txt>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onDismiss}
          hitSlop={8}
          style={({ pressed }) => ({
            opacity: pressed ? 0.6 : 1,
            padding: t.spacing.xs,
          })}
        >
          <SymbolView
            name={{ ios: "xmark", android: "close", web: "close" }}
            tintColor={t.colors.textMuted}
            size={20}
          />
        </Pressable>
      </View>
      <Callout tone="danger">
        {reasonText}
      </Callout>
    </Card>
  );
}
