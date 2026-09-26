// Owner: Andy — bordered surface for event cards and grouped content.
import type { ReactNode } from "react";
import { View } from "react-native";
import { useTheme } from "./useTheme";

export function Card({ children }: { children?: ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: t.colors.surface,
        borderColor: t.colors.border,
        borderWidth: 1,
        borderRadius: t.radius.md,
        padding: t.spacing.md,
        gap: t.spacing.sm,
      }}
    >
      {children}
    </View>
  );
}
