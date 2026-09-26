// Owner: Andy — quick-tap favorite categories. Values are Places API (New) Table A place types so
// Riley's pre-sort can match them against `primaryType` (plan §6). Checked against
// https://developers.google.com/maps/documentation/places/web-service/place-types
// Two chips have no exact type, so they use the closest real one:
// - Casual dining → `restaurant`: the generic type Google gives sit-down places with no cuisine subtype.
// - Boba → `tea_house`: Table A has no bubble tea / boba type.

export const FAVORITE_CATEGORIES = [
  { value: "coffee_shop", label: "Coffee" },
  { value: "taco_restaurant", label: "Tacos" },
  { value: "restaurant", label: "Casual dining" },
  { value: "sushi_restaurant", label: "Sushi" },
  { value: "pizza_restaurant", label: "Pizza" },
  { value: "bar", label: "Bars" },
  { value: "tea_house", label: "Boba" },
  { value: "dessert_shop", label: "Dessert" },
] as const;

export const MAX_FAVORITES = 20; // PutFavoritesRequest limit

export function toggleCategory(selected: readonly string[], value: string): string[] {
  if (selected.includes(value)) return selected.filter((v) => v !== value);
  if (selected.length >= MAX_FAVORITES) return [...selected];
  return [...selected, value];
}
