// Owner: Andy — primary / secondary / ghost button with a loading state.
import { ActivityIndicator, Pressable, Text } from "react-native";
import { useTheme } from "./useTheme";

type Props = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
};

export function Button({ label, onPress, variant = "primary", disabled, loading }: Props) {
  const t = useTheme();
  const inactive = !!disabled || !!loading;
  const bg = variant === "primary" ? t.colors.primary : variant === "secondary" ? t.colors.surface : "transparent";
  const fg = variant === "primary" ? t.colors.onPrimary : t.colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderRadius: t.radius.md,
        paddingVertical: 14,
        paddingHorizontal: t.spacing.md,
        alignItems: "center",
        opacity: inactive ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontSize: t.font.body, fontWeight: "600" }}>{label}</Text>
      )}
    </Pressable>
  );
}
