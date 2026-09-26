// Owner: Andy — round avatar (#97). Initials on primarySoft until avatar upload exists
// (#96 shipped without it). radius.pill is allowed here: avatars and dots only.
import { View } from "react-native";
import { initials } from "./initials";
import { Txt } from "./Txt";
import { useTheme } from "./useTheme";

type Props = {
  /** What others see: display_name ?? username. */
  name: string;
  size?: "sm" | "md" | "lg";
};

const TEXT = { sm: "small", md: "label", lg: "section" } as const;

export function Avatar({ name, size = "md" }: Props) {
  const t = useTheme();
  const d = t.avatar[size];
  return (
    <View
      // Decorative: the name is always shown next to it.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: d,
        height: d,
        borderRadius: t.radius.pill,
        backgroundColor: t.colors.primarySoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Txt variant={TEXT[size]} color="heading">
        {initials(name)}
      </Txt>
    </View>
  );
}
