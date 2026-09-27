import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useState: (init: unknown) => [init, vi.fn()],
    useRef: (init: unknown) => ({ current: init }),
  };
});

vi.mock("./useBusyAction", () => ({
  useBusyAction: () => ({
    isBusy: () => false,
    error: null,
    setError: vi.fn(),
    runAction: vi.fn(),
  }),
}));

vi.mock("expo-router", () => ({
  router: { push: vi.fn() },
}));

vi.mock("react-native", () => ({
  View: "View",
  Pressable: "Pressable",
}));

vi.mock("../../ui", () => {
  const MockTextField = (props: unknown) => null;
  return {
    Badge: () => null,
    Button: () => null,
    Callout: () => null,
    TextField: MockTextField,
    Txt: () => null,
    useTheme: () => ({ spacing: { sm: 8 }, touch: 44 }),
  };
});

import { TextField } from "../../ui";
import { FriendSearch } from "./FriendSearch";

function elements(node: ReactNode): ReactElement[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement(child) ? [child, ...elements((child.props as { children?: ReactNode }).children)] : [],
  );
}

describe("FriendSearch", () => {
  it("renders TextField with placeholder 'search', no label, and explicit accessibilityLabel", () => {
    const rendered = elements(FriendSearch({}));
    const input = rendered.find((element) => element.type === TextField);

    expect(input).toBeDefined();
    const props = input?.props as { label?: string; placeholder?: string; accessibilityLabel?: string };
    expect(props.label).toBeUndefined();
    expect(props.placeholder).toBe("search");
    expect(props.accessibilityLabel).toBe("Search friends by username");
  });
});
