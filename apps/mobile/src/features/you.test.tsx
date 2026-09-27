import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: any) => [typeof initial === "function" ? initial() : initial, vi.fn()],
    useEffect: (effect: any) => effect(),
    useCallback: (cb: any) => cb,
  };
});

vi.mock("react-native", () => ({
  View: "View",
  RefreshControl: "RefreshControl",
  ScrollView: "ScrollView",
}));

vi.mock("expo-router", () => ({
  router: {
    push: vi.fn(),
    replace: vi.fn(),
  },
}));

vi.mock("../lib/api", () => ({
  api: vi.fn().mockResolvedValue({
    id: "u1",
    username: "riley",
    display_name: "Riley Hagland",
    email: "riley@example.com",
  }),
}));

vi.mock("../lib/push", () => ({
  unregisterPushToken: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/secureSession", () => ({
  session: {
    clear: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("./calendar", () => ({
  AvailabilitySettings: (props: any) => ({ type: "AvailabilitySettings", props }),
}));

vi.mock("./favorites", () => ({
  FavoritesSettings: (props: any) => ({ type: "FavoritesSettings", props }),
}));

vi.mock("./friends", () => ({
  CloseFriendsSettings: (props: any) => ({ type: "CloseFriendsSettings", props }),
}));

vi.mock("../ui", () => ({
  Button: (props: any) => ({ type: "Button", props }),
  Callout: (props: any) => ({ type: "Callout", props }),
  Card: (props: any) => ({ type: "Card", props, children: props.children }),
  Screen: (props: any) => ({ type: "Screen", props, children: props.children }),
  Txt: (props: any) => ({ type: "Txt", props }),
  useTheme: () => ({
    colors: { primary: "#6A00F4", border: "#ccc", surface: "#fff" },
    spacing: { xl: 32, sm: 8, md: 16, lg: 24 },
  }),
}));

import You from "../app/(main)/you";

function findElements(node: ReactNode): ReactElement[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement(child) ? [child, ...findElements((child.props as { children?: ReactNode }).children)] : []
  );
}

describe("You screen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders settings sections with unique prefixed keys without React key collisions", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const rendered = You();
    const allElements = findElements(rendered);

    // Verify no React key duplicate warnings were emitted
    const duplicateKeyWarnings = consoleErrorSpy.mock.calls.filter((call) =>
      call.some((arg) => typeof arg === "string" && arg.includes("Encountered two children with the same key")),
    );
    expect(duplicateKeyWarnings).toHaveLength(0);

    // Find the settings elements in the rendered tree
    const favorites = allElements.find((e) => (e.type as any) === "FavoritesSettings" || (e.type as any)?.name === "FavoritesSettings");
    const availability = allElements.find((e) => (e.type as any) === "AvailabilitySettings" || (e.type as any)?.name === "AvailabilitySettings");
    const closeFriends = allElements.find((e) => (e.type as any) === "CloseFriendsSettings" || (e.type as any)?.name === "CloseFriendsSettings");

    expect(favorites).toBeDefined();
    expect(availability).toBeDefined();
    expect(closeFriends).toBeDefined();

    expect(favorites?.key).toMatch(/favorites-0/);
    expect(availability?.key).toMatch(/availability-0/);
    expect(closeFriends?.key).toMatch(/close-friends-0/);

    const keys = [favorites?.key, availability?.key, closeFriends?.key];
    expect(new Set(keys).size).toBe(3);

    consoleErrorSpy.mockRestore();
  });
});
