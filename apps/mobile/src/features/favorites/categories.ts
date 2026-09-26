// Owner: Andy — quick-tap favorite categories. Values are Places API (New) primary types so
// Riley's pre-sort can match them against `primaryType` (plan §6).

export const FAVORITE_CATEGORIES = [
  { value: "coffee_shop", label: "Coffee" },
  { value: "mexican_restaurant", label: "Tacos" },
  { value: "american_restaurant", label: "Casual dining" },
  { value: "pizza_restaurant", label: "Pizza" },
  { value: "ramen_restaurant", label: "Ramen" },
  { value: "bakery", label: "Bakery" },
  { value: "ice_cream_shop", label: "Ice cream" },
  { value: "bar", label: "Bars" },
] as const;

export const MAX_FAVORITES = 20; // PutFavoritesRequest limit

export function toggleCategory(selected: readonly string[], value: string): string[] {
  if (selected.includes(value)) return selected.filter((v) => v !== value);
  if (selected.length >= MAX_FAVORITES) return [...selected];
  return [...selected, value];
}
