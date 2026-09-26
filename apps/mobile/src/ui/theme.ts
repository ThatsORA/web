// Owner: Andy — design tokens. Pure data so it can be unit-tested without React Native.
export type ColorScheme = "light" | "dark";

export type Palette = {
  background: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  info: string;
  infoSurface: string;
  success: string;
  successSurface: string;
  danger: string;
  dangerSurface: string;
};

const light: Palette = {
  background: "#FFFFFF",
  surface: "#F4F5F7",
  border: "#DADCE0",
  text: "#111418",
  textMuted: "#5F6670",
  primary: "#208AEF",
  onPrimary: "#FFFFFF",
  info: "#1565C0",
  infoSurface: "#E6F1FD",
  success: "#1B7F3B",
  successSurface: "#E5F5EA",
  danger: "#C62828",
  dangerSurface: "#FDECEC",
};

const dark: Palette = {
  background: "#0E1013",
  surface: "#1A1D22",
  border: "#2E333A",
  text: "#F2F4F7",
  textMuted: "#9AA3AE",
  primary: "#4AA3F5",
  onPrimary: "#0E1013",
  info: "#8CC4FA",
  infoSurface: "#132A40",
  success: "#7ED69A",
  successSurface: "#12301D",
  danger: "#F28B82",
  dangerSurface: "#3A1716",
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 8, md: 12, pill: 999 } as const;
export const font = { small: 14, body: 16, heading: 20, title: 28 } as const;

export type Theme = {
  scheme: ColorScheme;
  colors: Palette;
  spacing: typeof spacing;
  radius: typeof radius;
  font: typeof font;
};

/** Maps the OS setting to a theme. Anything other than "dark" falls back to light. */
export function themeFor(scheme: string | null | undefined): Theme {
  const resolved: ColorScheme = scheme === "dark" ? "dark" : "light";
  return { scheme: resolved, colors: resolved === "dark" ? dark : light, spacing, radius, font };
}

export type Tone = "info" | "success" | "danger";

/** Foreground/background pair for a tone (Callout). */
export function toneColors(theme: Theme, tone: Tone): { fg: string; bg: string } {
  const c = theme.colors;
  switch (tone) {
    case "success":
      return { fg: c.success, bg: c.successSurface };
    case "danger":
      return { fg: c.danger, bg: c.dangerSurface };
    default:
      return { fg: c.info, bg: c.infoSurface };
  }
}
