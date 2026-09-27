import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { TextField } from "./TextField";
import { Txt } from "./Txt";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (init: any) => [init, vi.fn()],
  };
});

vi.mock("react-native", () => ({
  View: "View",
  TextInput: "TextInput",
}));

vi.mock("./Txt", () => ({
  Txt: (props: any) => ({ type: "Txt", props }),
}));

vi.mock("./useTheme", () => ({
  useTheme: () => ({
    colors: {
      textMuted: "#888",
      heading: "#111",
      surfaceMuted: "#eee",
      surface: "#fff",
      danger: "#f00",
      primary: "#00f",
      borderStrong: "#ccc",
    },
    spacing: { xs: 4, ms: 12 },
    type: { body: {} },
    radius: { sm: 4 },
    touch: 44,
  }),
}));

function elements(node: ReactNode): ReactElement[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement(child) ? [child, ...elements((child.props as { children?: ReactNode }).children)] : [],
  );
}

describe("TextField", () => {
  it("renders with a label and applies it to accessibilityLabel", () => {
    const rendered = elements(TextField({ label: "Username", placeholder: "Enter username" }));
    const txts = rendered.filter((e) => e.type === "Txt" || e.type === Txt);
    expect(txts.some((t) => (t.props as { children?: ReactNode }).children === "Username")).toBe(true);

    const input = rendered.find((e) => e.type === "TextInput");
    expect(input).toBeDefined();
    expect((input?.props as { accessibilityLabel?: string })?.accessibilityLabel).toBe("Username");
  });

  it("renders without a label and falls back accessibilityLabel to placeholder", () => {
    const rendered = elements(TextField({ placeholder: "Search" }));
    const txts = rendered.filter((e) => e.type === "Txt" || e.type === Txt);
    expect(txts.length).toBe(0);

    const input = rendered.find((e) => e.type === "TextInput");
    expect(input).toBeDefined();
    expect((input?.props as { accessibilityLabel?: string })?.accessibilityLabel).toBe("Search");
  });

  it("displays error text when error is passed", () => {
    const rendered = elements(TextField({ label: "Email", error: "Invalid email" }));
    const txts = rendered.filter((e) => e.type === "Txt" || e.type === Txt);
    expect(txts.some((t) => (t.props as { children?: ReactNode }).children === "Invalid email")).toBe(true);
  });
});
