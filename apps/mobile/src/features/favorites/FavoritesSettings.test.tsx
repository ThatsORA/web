import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "@web/contract";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: any) => [typeof initial === "function" ? initial() : initial, vi.fn()],
    useEffect: (effect: any) => effect(),
  };
});

vi.mock("react-native", () => ({
  View: "View",
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
}));

vi.mock("../../lib/api", () => ({
  api: vi.fn(),
}));

vi.mock("../../ui", () => ({
  Button: (props: any) => ({ type: "Button", props }),
  Callout: (props: any) => ({ type: "Callout", props }),
  Card: (props: any) => ({ type: "Card", props, children: props.children }),
  Chip: (props: any) => ({ type: "Chip", props }),
  Txt: (props: any) => ({ type: "Txt", props }),
  useTheme: () => ({
    colors: { primary: "#6A00F4" },
    spacing: { sm: 8 },
  }),
}));

import { api } from "../../lib/api";
import { Button, Callout, Card, Chip } from "../../ui";
import { FavoritesSettings, FavoritesSettingsView } from "./FavoritesSettings";

function elements(node: ReactNode): ReactElement[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement(child) ? [child, ...elements((child.props as { children?: ReactNode }).children)] : [],
  );
}

describe("FavoritesSettingsView", () => {
  it("renders loading indicator and disabled button while loading", () => {
    const rendered = elements(
      FavoritesSettingsView({
        selected: [],
        loading: true,
        saving: false,
        saved: false,
        error: null,
        onToggle: vi.fn(),
        onSave: vi.fn(),
      }),
    );
    const indicators = rendered.filter((e) => e.type === "ActivityIndicator");
    expect(indicators.length).toBe(1);

    const button = rendered.find((e) => e.type === Button);
    expect(button).toBeDefined();
    expect((button?.props as any).disabled).toBe(true);
  });

  it("renders chips with saved favorites highlighted when loaded", () => {
    const onToggle = vi.fn();
    const rendered = elements(
      FavoritesSettingsView({
        selected: ["coffee_shop", "bar"],
        loading: false,
        saving: false,
        saved: false,
        error: null,
        onToggle,
        onSave: vi.fn(),
      }),
    );
    const chips = rendered.filter((e) => e.type === Chip);
    expect(chips.length).toBeGreaterThan(0);

    const coffeeChip = chips.find((c) => (c.props as any).label === "Coffee");
    expect(coffeeChip).toBeDefined();
    expect((coffeeChip?.props as any)?.selected).toBe(true);

    const pizzaChip = chips.find((c) => (c.props as any).label === "Pizza");
    expect(pizzaChip).toBeDefined();
    expect((pizzaChip?.props as any)?.selected).toBe(false);

    (coffeeChip?.props as any)?.onPress();
    expect(onToggle).toHaveBeenCalledWith("coffee_shop");
  });

  it("renders success callout when saved is true", () => {
    const rendered = elements(
      FavoritesSettingsView({
        selected: ["coffee_shop"],
        loading: false,
        saving: false,
        saved: true,
        error: null,
        onToggle: vi.fn(),
        onSave: vi.fn(),
      }),
    );
    const callouts = rendered.filter((e) => e.type === Callout);
    expect(callouts.some((c) => (c.props as any).title === "Favorites saved")).toBe(true);
  });

  it("renders error callout when error is set", () => {
    const rendered = elements(
      FavoritesSettingsView({
        selected: [],
        loading: false,
        saving: false,
        saved: false,
        error: "Network failure",
        onToggle: vi.fn(),
        onSave: vi.fn(),
      }),
    );
    const callouts = rendered.filter((e) => e.type === Callout);
    expect(callouts.some((c) => (c.props as any).title === "Couldn't save favorites")).toBe(true);
  });
});

describe("FavoritesSettings container", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches saved favorites from GET /favorites on mount", () => {
    (api as any).mockResolvedValue({ categories: ["coffee_shop"] });
    FavoritesSettings();
    expect(api).toHaveBeenCalledWith(routes.favorites, expect.anything());
  });
});
