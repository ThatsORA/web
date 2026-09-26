// Owner: Andy — round avatar. Initials on violet for now: the backend has no avatar upload yet (#134).
// `radius.pill` is allowed here: avatars and status dots are the only round things (wiki/design.md).
import { View } from "react-native";
import { initials } from "./initials";
import { Txt } from "./Txt";
import { useTheme } from "./useTheme";

type Props = { name: string };

export function Avatar({ name }: Props) {
  const t = useTheme();
  const size = t.spacing.xxl * 2;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: t.radius.pill,
        backgroundColor: t.colors.primary,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Txt variant="title" color="onPrimary">
        {initials(name)}
      </Txt>
    </View>
  );
}
