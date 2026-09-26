// Owner: Andy — small status tag. `new` is the lime "look here" tag; tones are soft
// fill + 1px tinted border. Always carries a word, never color alone.
import { View } from "react-native";
import { toneColors, type Tone } from "./theme";
import { Txt } from "./Txt";
import { useTheme } from "./useTheme";

type Props = { label: string; tone?: Tone | "neutral" | "new" };

export function Badge({ label, tone = "neutral" }: Props) {
  const t = useTheme();
  const c = t.colors;
  const style =
    tone === "new"
      ? { bg: c.lime, border: c.lime, fg: c.onLime }
      : tone === "neutral"
        ? { bg: c.surfaceMuted, border: c.surfaceMuted, fg: c.text }
        : (() => {
            const { fg, bg } = toneColors(t, tone);
            return { bg, border: fg + "40", fg };
          })();
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: style.bg,
        borderColor: style.border,
        borderWidth: 1,
        borderRadius: t.radius.sm,
        paddingVertical: 2,
        paddingHorizontal: t.spacing.sm,
      }}
    >
      <Txt variant="small" style={{ color: style.fg, fontFamily: t.fonts.monoMedium }}>
        {tone === "new" ? label.toUpperCase() : label}
      </Txt>
    </View>
  );
}
