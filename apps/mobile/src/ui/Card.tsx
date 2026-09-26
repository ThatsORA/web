// Owner: Andy — bordered surface (borders, never shadows). `tint` = surfaceCard.
import type { ReactNode } from "react";
import { View } from "react-native";
import { useTheme } from "./useTheme";

type Props = { children?: ReactNode; tint?: boolean; /** Brand band, e.g. the confirmed event header. */ brand?: boolean };

export function Card({ children, tint, brand }: Props) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: brand ? t.colors.primary : tint ? t.colors.surfaceCard : t.colors.surface,
        borderColor: brand ? t.colors.primary : t.colors.border,
        borderWidth: 1,
        borderRadius: t.radius.md,
        padding: t.spacing.lg,
        gap: t.spacing.ms,
      }}
    >
      {children}
    </View>
  );
}
