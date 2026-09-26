// Owner: Andy — toggleable tag (favorites quick-tap, filters). 1px corners, 44pt tall.
import { Pressable } from "react-native";
import { Txt } from "./Txt";
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
      style={({ pressed }) => ({
        minHeight: t.touch,
        justifyContent: "center",
        borderRadius: t.radius.md,
        borderWidth: 1,
        borderColor: selected ? t.colors.primary : t.colors.borderStrong,
        backgroundColor: selected ? t.colors.primary : pressed ? t.colors.primarySofter : t.colors.surface,
        paddingHorizontal: t.spacing.md,
      })}
    >
      <Txt variant="label" color={selected ? "onPrimary" : "heading"}>
        {label}
      </Txt>
    </Pressable>
  );
}
