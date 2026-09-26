// Owner: Andy — Primer button: 44pt tall, 1px corners, Geist Mono label.
import { ActivityIndicator, Pressable } from "react-native";
import { Txt } from "./Txt";
import { useTheme } from "./useTheme";

type Props = {
  label: string;
  onPress: () => void;
  /** primary = brand; secondary = muted fill; outline = bordered; ghost = link-style; onBrand = white, for violet bands */
  variant?: "primary" | "secondary" | "outline" | "ghost" | "onBrand";
  disabled?: boolean;
  loading?: boolean;
};

export function Button({ label, onPress, variant = "primary", disabled, loading }: Props) {
  const t = useTheme();
  const c = t.colors;
  const inactive = !!disabled || !!loading;
  const fg = variant === "onBrand" ? "primary" : variant === "primary" ? "onPrimary" : variant === "secondary" ? "heading" : variant === "outline" ? "heading" : "link";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: t.touch,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: t.spacing.md,
        borderRadius: t.radius.md,
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
              ? c.surfaceMuted
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
      {loading ? <ActivityIndicator color={c[fg]} /> : <Txt variant="label" color={fg}>{label}</Txt>}
    </Pressable>
  );
}
