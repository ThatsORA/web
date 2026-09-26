import { PutFavoritesRequest } from "@web/contract";
import { describe, expect, it } from "vitest";
import { FAVORITE_CATEGORIES, MAX_FAVORITES, toggleCategory } from "./categories";

describe("toggleCategory", () => {
  it("adds, then removes, preserving tap order", () => {
    let s = toggleCategory([], "coffee_shop");
    s = toggleCategory(s, "mexican_restaurant");
    expect(s).toEqual(["coffee_shop", "mexican_restaurant"]);
    expect(toggleCategory(s, "coffee_shop")).toEqual(["mexican_restaurant"]);
  });

  it("does not mutate its input", () => {
    const s = ["bar"];
    toggleCategory(s, "bakery");
    expect(s).toEqual(["bar"]);
  });

  it("caps at the contract limit", () => {
    const full = Array.from({ length: MAX_FAVORITES }, (_, i) => `c${i}`);
    expect(toggleCategory(full, "extra")).toHaveLength(MAX_FAVORITES);
    expect(PutFavoritesRequest.safeParse({ categories: full }).success).toBe(true);
  });

  it("offers the demo picks: coffee, tacos, casual dining", () => {
    const labels = FAVORITE_CATEGORIES.map((c) => c.label);
    expect(labels).toEqual(expect.arrayContaining(["Coffee", "Tacos", "Casual dining"]));
  });
});
