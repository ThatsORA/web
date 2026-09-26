// Owner: Andy — tinted message box, e.g. "Synced 23 busy blocks. We never read event titles."
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { toneColors, type Tone } from "./theme";
import { useTheme } from "./useTheme";

type Props = { tone?: Tone; title?: string; children?: ReactNode };

export function Callout({ tone = "info", title, children }: Props) {
  const t = useTheme();
  const { fg, bg } = toneColors(t, tone);
  return (
    <View
      accessibilityRole={tone === "danger" ? "alert" : "summary"}
      style={{ backgroundColor: bg, borderRadius: t.radius.md, padding: t.spacing.md, gap: t.spacing.xs }}
    >
      {title ? <Text style={{ color: fg, fontSize: t.font.body, fontWeight: "600" }}>{title}</Text> : null}
      {typeof children === "string" ? <Text style={{ color: fg, fontSize: t.font.small }}>{children}</Text> : children}
    </View>
  );
}
