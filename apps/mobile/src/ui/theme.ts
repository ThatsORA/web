// Owner: Andy — design tokens for Primer (violet edition). See wiki/design.md.
// Pure data so it can be unit-tested without React Native.
// Rule for every screen: use these tokens, never raw hex, px or font names.
export type ColorScheme = "light" | "dark";

export type Palette = {
  // --- surfaces
  background: string; // page
  surface: string; // cards, panels, inputs
  surfaceCard: string; // tinted cards / stat tiles
  surfaceMuted: string; // secondary buttons, table-style headers
  // --- lines
  border: string; // default 1px border
  borderStrong: string; // inputs, emphasized dividers
  // --- text
  heading: string; // headings, strong numbers
  text: string; // body copy
  textMuted: string; // meta, labels, timestamps
  link: string;
  // --- brand (electric violet)
  primary: string; // brand surfaces, primary buttons, active states
  primaryStrong: string; // pressed primary
  primarySoft: string; // selected rows, active underline area
  primarySofter: string; // subtle brand tint backgrounds
  onPrimary: string; // text/icons on primary
  // --- highlight: lime means "look here" (new, urgent). Never lime text on light surfaces.
  lime: string;
  onLime: string; // always dark, in both schemes
  // --- status (always pair with a word or icon, never color alone)
  info: string;
  infoSurface: string;
  success: string;
  successSurface: string;
  warning: string;
  warningSurface: string;
  danger: string;
  dangerSurface: string;
};

const BRAND = "#6A00F4"; // electric violet: 7.2:1 with white text
const BRAND_STRONG = "#5200C2";
const LIME = "#EDFF45";
const INK = "#140A2E";

const light: Palette = {
  background: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceCard: "#F7F4FE",
  surfaceMuted: "#EFEAFB",
  border: "#E4DDF5",
  borderStrong: "#CBC2E3",
  heading: INK,
  text: "#3A3450",
  textMuted: "#6B6584",
  link: BRAND,
  primary: BRAND,
  primaryStrong: BRAND_STRONG,
  primarySoft: "#EBDDFF",
  primarySofter: "#F6F0FF",
  onPrimary: "#FFFFFF",
  lime: LIME,
  onLime: INK,
  info: BRAND,
  infoSurface: "#F6F0FF",
  success: "#15803D",
  successSurface: "#ECFDF3",
  warning: "#B45309",
  warningSurface: "#FFFAEB",
  danger: "#C81E1E",
  dangerSurface: "#FFF1F2",
};

const dark: Palette = {
  background: "#0B0718",
  surface: "#120C24",
  surfaceCard: "#170F2E",
  surfaceMuted: "#1E1638",
  border: "#2E2450",
  borderStrong: "#443768",
  heading: "#F6F3FF",
  text: "#E8E3F7",
  textMuted: "#A69FC2",
  link: "#C4A5FF",
  primary: BRAND,
  primaryStrong: BRAND_STRONG,
  primarySoft: "#2A1650",
  primarySofter: "#1A1033",
  onPrimary: "#FFFFFF",
  lime: LIME,
  onLime: INK,
  info: "#C4A5FF",
  infoSurface: "#1A1033",
  success: "#4ADE80",
  successSurface: "#0F2A1B",
  warning: "#FBBF24",
  warningSurface: "#2A1F08",
  danger: "#F87171",
  dangerSurface: "#2A0E12",
};

/** 4pt base. Cards use lg padding; screens use lg gutters. */
export const spacing = { xs: 4, sm: 8, ms: 12, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
/** Exact, not soft: 1px on every component. `pill` is only for avatars and status dots. */
export const radius = { sm: 1, md: 1, pill: 999 } as const;
/** Minimum touch target (buttons, chips, inputs). */
export const touch = 44;
/** Avatar diameters: sm for list rows, md for headers, lg for a profile. */
export const avatar = { sm: 32, md: touch, lg: 72 } as const;
/** Font sizes. Prefer the `type` presets below, which set family + line height too. */
export const font = { small: 12, body: 15, label: 15, heading: 20, title: 28, display: 34 } as const;

/** Loaded in src/app/_layout.tsx. Custom fonts ignore fontWeight: pick the family instead. */
export const fonts = {
  display: "PlayfairDisplay_700Bold",
  displaySemi: "PlayfairDisplay_600SemiBold",
  mono: "GeistMono_400Regular",
  monoMedium: "GeistMono_500Medium",
  monoSemi: "GeistMono_600SemiBold",
  monoBold: "GeistMono_700Bold",
} as const;

export type TextPreset = { fontFamily: string; fontSize: number; lineHeight: number; letterSpacing?: number };

/**
 * Serif speaks, mono works. Playfair only for `display` and `headline`
 * (screen headlines, the event card's hero line). Everything else is Geist Mono.
 */
export const type = {
  hero: { fontFamily: fonts.display, fontSize: 64, lineHeight: 68, letterSpacing: -1 }, // welcome screen wordmark only
  display: { fontFamily: fonts.display, fontSize: font.display, lineHeight: 40, letterSpacing: -0.5 },
  headline: { fontFamily: fonts.displaySemi, fontSize: 24, lineHeight: 30, letterSpacing: -0.3 },
  title: { fontFamily: fonts.monoBold, fontSize: font.title, lineHeight: 36 },
  section: { fontFamily: fonts.monoSemi, fontSize: font.heading, lineHeight: 28 },
  stat: { fontFamily: fonts.monoBold, fontSize: 28, lineHeight: 32 },
  body: { fontFamily: fonts.mono, fontSize: font.body, lineHeight: 22 },
  label: { fontFamily: fonts.monoMedium, fontSize: font.label, lineHeight: 20 },
  small: { fontFamily: fonts.mono, fontSize: font.small, lineHeight: 16 },
  eyebrow: { fontFamily: fonts.monoMedium, fontSize: font.small, lineHeight: 16, letterSpacing: 0.5 }, // UPPERCASE the text
} as const satisfies Record<string, TextPreset>;

export type Theme = {
  scheme: ColorScheme;
  colors: Palette;
  spacing: typeof spacing;
  radius: typeof radius;
  font: typeof font;
  fonts: typeof fonts;
  type: typeof type;
  touch: typeof touch;
  avatar: typeof avatar;
};

/** Maps the OS setting to a theme. Anything other than "dark" falls back to light. */
export function themeFor(scheme: string | null | undefined): Theme {
  const resolved: ColorScheme = scheme === "dark" ? "dark" : "light";
  return {
    scheme: resolved,
    colors: resolved === "dark" ? dark : light,
    spacing,
    radius,
    font,
    fonts,
    type,
    touch,
    avatar,
  };
}

export type Tone = "info" | "success" | "warning" | "danger";

/** Foreground/background pair for a tone (Callout, Badge). */
export function toneColors(theme: Theme, tone: Tone): { fg: string; bg: string } {
  const c = theme.colors;
  switch (tone) {
    case "success":
      return { fg: c.success, bg: c.successSurface };
    case "warning":
      return { fg: c.warning, bg: c.warningSurface };
    case "danger":
      return { fg: c.danger, bg: c.dangerSurface };
    default:
      return { fg: c.info, bg: c.infoSurface };
  }
}

/** WCAG 2.x contrast ratio between two #RRGGBB colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = hex.replace("#", "");
    const [r, g, bl] = [0, 2, 4].map((i) => {
      const v = parseInt(n.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Every text-on-background pair the components use. Each must be ≥ 4.5:1 (WCAG AA). */
export const TEXT_PAIRS: ReadonlyArray<readonly [keyof Palette, keyof Palette]> = [
  ["heading", "background"],
  ["text", "background"],
  ["textMuted", "background"],
  ["heading", "surface"],
  ["text", "surface"],
  ["textMuted", "surface"],
  ["text", "surfaceCard"],
  ["textMuted", "surfaceCard"],
  ["heading", "surfaceMuted"],
  ["textMuted", "surfaceMuted"],
  ["link", "background"],
  ["link", "surface"],
  ["onPrimary", "primary"],
  ["onPrimary", "primaryStrong"],
  ["primary", "onPrimary"], // Button onBrand: violet label on white, over a violet band
  ["heading", "primarySoft"],
  ["onLime", "lime"],
  ["info", "infoSurface"],
  ["success", "successSurface"],
  ["warning", "warningSurface"],
  ["danger", "dangerSurface"],
];
