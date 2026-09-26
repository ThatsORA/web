// Owner: Andy — safe-area page wrapper with optional title and a pinned footer.
import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "./useTheme";

type Props = {
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  /** Pinned below the scroll area, e.g. the primary Button. */
  footer?: ReactNode;
};

export function Screen({ title, subtitle, children, footer }: Props) {
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}
        keyboardShouldPersistTaps="handled"
      >
        {title ? (
          <Text accessibilityRole="header" style={{ color: t.colors.text, fontSize: t.font.title, fontWeight: "700" }}>
            {title}
          </Text>
        ) : null}
        {subtitle ? <Text style={{ color: t.colors.textMuted, fontSize: t.font.body }}>{subtitle}</Text> : null}
        {children}
      </ScrollView>
      {footer ? <View style={{ padding: t.spacing.lg, gap: t.spacing.sm }}>{footer}</View> : null}
    </SafeAreaView>
  );
}
