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
    toggleCategory(s, "dessert_shop");
    expect(s).toEqual(["bar"]);
  });

  it("caps at the contract limit", () => {
    const full = Array.from({ length: MAX_FAVORITES }, (_, i) => `c${i}`);
    expect(toggleCategory(full, "extra")).toHaveLength(MAX_FAVORITES);
    expect(PutFavoritesRequest.safeParse({ categories: full }).success).toBe(true);
  });
});

describe("FAVORITE_CATEGORIES", () => {
  it("offers the issue #13 chips, demo picks (coffee, tacos, casual dining) first", () => {
    expect(FAVORITE_CATEGORIES.map((c) => c.label)).toEqual([
      "Coffee", "Tacos", "Casual dining", "Sushi", "Pizza", "Bars", "Boba", "Dessert",
    ]);
  });

  it("maps each chip to a Places API (New) Table A type", () => {
    expect(Object.fromEntries(FAVORITE_CATEGORIES.map((c) => [c.label, c.value]))).toEqual({
      Coffee: "coffee_shop",
      Tacos: "mexican_restaurant",
      "Casual dining": "restaurant", // closest match: no casual-dining type
      Sushi: "sushi_restaurant",
      Pizza: "pizza_restaurant",
      Bars: "bar",
      Boba: "tea_house", // closest match: no bubble tea type
      Dessert: "dessert_shop",
    });
  });

  it("has unique values that fit in one PutFavoritesRequest", () => {
    const values = FAVORITE_CATEGORIES.map((c) => c.value);
    expect(new Set(values).size).toBe(values.length);
    expect(PutFavoritesRequest.safeParse({ categories: values }).success).toBe(true);
  });
});
