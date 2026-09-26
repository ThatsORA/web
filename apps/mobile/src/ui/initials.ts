// Owner: Andy — the letters an Avatar shows when there's no photo. Pure, so it's unit-tested.

/** First letter of the first two words, uppercased: "Ada Lovelace" → "AL", "ada" → "A". */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toUpperCase();
}
