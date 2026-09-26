import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  View: "View",
  Pressable: "Pressable",
  TextInput: "TextInput",
  ActivityIndicator: "ActivityIndicator",
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("expo-symbols", () => ({
  SymbolView: "SymbolView",
}));
vi.mock("expo-router", () => ({
  router: { push: vi.fn(), replace: vi.fn() },
}));

import { AvailabilitySettings } from "../calendar";
import { FavoritesSettings } from "./FavoritesSettings";
import { CloseFriendsSettings } from "../friends";

describe("Settings Mount Points", () => {
  it("exports FavoritesSettings component", () => {
    expect(typeof FavoritesSettings).toBe("function");
  });

  it("exports AvailabilitySettings mount point", () => {
    expect(typeof AvailabilitySettings).toBe("function");
  });

  it("exports CloseFriendsSettings mount point (undefined until implemented by Ojas)", () => {
    expect(CloseFriendsSettings).toBeUndefined();
  });
});
vi.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: vi.fn(),
  getCurrentPositionAsync: vi.fn(),
}));
vi.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: vi.fn(),
  openAuthSessionAsync: vi.fn(),
}));
vi.mock("expo-linking", () => ({
  createURL: vi.fn(),
  parse: vi.fn(),
}));
