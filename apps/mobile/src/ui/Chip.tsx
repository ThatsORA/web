// Owner: Andy — toggleable pill (favorites quick-tap, filters).
import { Pressable, Text } from "react-native";
import { useTheme } from "./useTheme";

type Props = { label: string; selected?: boolean; onPress?: () => void };

export function Chip({ label, selected = false, onPress }: Props) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{
        borderRadius: t.radius.pill,
        borderWidth: 1,
        borderColor: selected ? t.colors.primary : t.colors.border,
        backgroundColor: selected ? t.colors.primary : "transparent",
        paddingVertical: t.spacing.sm,
        paddingHorizontal: t.spacing.md,
      }}
    >
      <Text style={{ color: selected ? t.colors.onPrimary : t.colors.text, fontSize: t.font.small }}>{label}</Text>
    </Pressable>
  );
}
