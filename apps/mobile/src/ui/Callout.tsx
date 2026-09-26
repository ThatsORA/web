// Owner: Andy — tinted message box: soft fill + 1px tinted border, e.g.
// "Synced 23 busy blocks. We never read event titles."
import type { ReactNode } from "react";
import { View } from "react-native";
import { toneColors, type Tone } from "./theme";
import { Txt } from "./Txt";
import { useTheme } from "./useTheme";

type Props = { tone?: Tone; title?: string; children?: ReactNode };

export function Callout({ tone = "info", title, children }: Props) {
  const t = useTheme();
  const { fg, bg } = toneColors(t, tone);
  return (
    <View
      accessibilityRole={tone === "danger" ? "alert" : "summary"}
      style={{
        backgroundColor: bg,
        borderColor: fg + "40",
        borderWidth: 1,
        borderRadius: t.radius.md,
        padding: t.spacing.md,
        gap: t.spacing.xs,
      }}
    >
      {title ? (
        <Txt variant="label" style={{ color: fg }}>
          {title}
        </Txt>
      ) : null}
      {typeof children === "string" ? (
        <Txt variant="body" style={{ color: fg }}>
          {children}
        </Txt>
      ) : (
        children
      )}
    </View>
  );
}
