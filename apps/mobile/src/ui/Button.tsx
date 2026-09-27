// Owner: Andy — Primer button: 44pt tall, 1px corners, Geist Mono label.
import { ActivityIndicator, Pressable } from "react-native";
import { Txt } from "./Txt";
import { useTheme } from "./useTheme";

type Props = {
  label: string;
  onPress: () => void;
  /** primary = brand; secondary = muted fill; outline = bordered; ghost = link-style; onBrand = white, for violet bands */
  variant?: "primary" | "secondary" | "outline" | "ghost" | "onBrand";
  /** md = 44pt touch target (default); sm = 32pt compact button */
  size?: "md" | "sm";
  disabled?: boolean;
  loading?: boolean;
};

export function Button({ label, onPress, variant = "primary", size = "md", disabled, loading }: Props) {
  const t = useTheme();
  const c = t.colors;
  const inactive = !!disabled || !!loading;
  const fg = variant === "onBrand" ? "primary" : variant === "primary" ? "onPrimary" : variant === "secondary" ? "heading" : variant === "outline" ? "heading" : "link";
  const isSm = size === "sm";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: isSm ? 32 : t.touch,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: isSm ? t.spacing.sm : t.spacing.md,
        paddingVertical: isSm ? 2 : 0,
        borderRadius: isSm ? t.radius.sm : t.radius.md,
        borderWidth: variant === "outline" ? 1 : 0,
        borderColor: c.borderStrong,
        backgroundColor:
          variant === "onBrand"
            ? c.onPrimary // stays white when pressed: primarySoft is too dark for violet text in dark mode
            : variant === "primary"
            ? pressed
              ? c.primaryStrong
              : c.primary
            : variant === "secondary"
              ? pressed
                ? c.primarySoft
                : c.surfaceMuted
              : variant === "outline"
                ? pressed
                  ? c.primarySofter
                  : c.surface
                : pressed
                  ? c.primarySofter
                  : "transparent",
        opacity: inactive ? 0.5 : 1,
      })}
    >
      {loading ? <ActivityIndicator color={c[fg]} /> : <Txt variant={isSm ? "small" : "label"} color={fg}>{label}</Txt>}
    </Pressable>
  );
}
