// Owner: Andy — safe-area page: Playfair headline ("serif speaks"), mono subtitle,
// optional eyebrow, and a pinned footer for the primary action.
import type { ReactElement, ReactNode, Ref } from "react";
import { ScrollView, View, type RefreshControlProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Txt } from "./Txt";
import { useTheme } from "./useTheme";

type Props = {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  /** Pinned below the scroll area, e.g. the primary Button. */
  footer?: ReactNode;
  /** Passed to the ScrollView for pull-to-refresh, e.g. <RefreshControl />. */
  refreshControl?: ReactElement<RefreshControlProps>;
  /** Optional action/element displayed on the right of the header title. */
  headerRight?: ReactNode;
  /** For screens that scroll to a child, e.g. the feed opening at a notified event. */
  scrollRef?: Ref<ScrollView>;
};

export function Screen({ eyebrow, title, subtitle, children, footer, refreshControl, headerRight, scrollRef }: Props) {
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
      >
        {eyebrow ? <Txt variant="eyebrow">{eyebrow}</Txt> : null}
        {title || headerRight ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            {title ? (
              <Txt variant="display" accessibilityRole="header">
                {title}
              </Txt>
            ) : (
              <View />
            )}
            {headerRight}
          </View>
        ) : null}
        {subtitle ? <Txt variant="body" color="textMuted">{subtitle}</Txt> : null}
        {children}
      </ScrollView>
      {footer ? (
        <View
          style={{
            padding: t.spacing.lg,
            gap: t.spacing.sm,
            borderTopWidth: 1,
            borderTopColor: t.colors.border,
            backgroundColor: t.colors.background,
          }}
        >
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  );
}
