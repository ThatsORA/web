// Owner: Andy — the only way to render text. Plain <Text> falls back to the
// system font; this applies a Primer type preset + a palette color.
import type { ReactNode } from "react";
import { Text, type TextProps } from "react-native";
import type { Palette } from "./theme";
import { useTheme } from "./useTheme";

type Props = Omit<TextProps, "children"> & {
  variant?: "display" | "headline" | "title" | "section" | "stat" | "body" | "label" | "small" | "eyebrow";
  color?: keyof Palette;
  /** Tabular numbers for counts, times and countdowns. */
  numeric?: boolean;
  children?: ReactNode;
};

export function Txt({ variant = "body", color, numeric, style, children, ...rest }: Props) {
  const t = useTheme();
  const serif = variant === "display" || variant === "headline";
  const fallback: keyof Palette =
    serif || variant === "title" || variant === "section" || variant === "stat" ? "heading" : variant === "small" || variant === "eyebrow" ? "textMuted" : "text";
  const content = variant === "eyebrow" && typeof children === "string" ? children.toUpperCase() : children;
  return (
    <Text
      {...rest}
      style={[
        t.type[variant],
        { color: t.colors[color ?? fallback] },
        numeric ? { fontVariant: ["tabular-nums"] } : null,
        style,
      ]}
    >
      {content}
    </Text>
  );
}
