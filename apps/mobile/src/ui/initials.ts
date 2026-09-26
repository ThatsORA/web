// Owner: Andy — the letters an Avatar shows when there's no photo. Pure, no React Native.

/** "Andy Do" → "AD", "andy_do" → "A", "" → "?". Works on code points, so emoji and accents stay whole. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => Array.from(w)[0] ?? "");
  return letters.join("").toUpperCase() || "?";
}
