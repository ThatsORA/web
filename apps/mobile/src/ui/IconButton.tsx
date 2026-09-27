// Owner: Andy — round icon-only button (44pt touch target). SF Symbol on iOS, Material Symbol on Android/web.
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Pressable } from "react-native";
import { useTheme } from "./useTheme";

type Props = { icon: SymbolViewProps["name"]; label: string; onPress: () => void; disabled?: boolean };

export function IconButton({ icon, label, onPress, disabled }: Props) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={t.spacing.xs}
      style={({ pressed }) => ({
        width: t.touch,
        height: t.touch,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: t.radius.md,
        borderWidth: 1,
        borderColor: t.colors.borderStrong,
        backgroundColor: pressed ? t.colors.primarySofter : t.colors.surface,
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <SymbolView name={icon} tintColor={t.colors.heading} size={t.spacing.lg} />
    </Pressable>
  );
}
