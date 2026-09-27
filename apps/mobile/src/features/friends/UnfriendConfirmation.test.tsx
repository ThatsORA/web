import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ View: "View" }));
vi.mock("../../ui", () => ({
  Button: () => null,
  Card: () => null,
  Txt: () => null,
  useTheme: () => ({ spacing: { sm: 8 } }),
}));

import { Button, Txt } from "../../ui";
import { UnfriendConfirmation } from "./UnfriendConfirmation";

function elements(node: ReactNode): ReactElement[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement(child) ? [child, ...elements((child.props as { children?: ReactNode }).children)] : [],
  );
}

const friend = { id: "friend-id", username: "riley", display_name: "Riley H.", close: true };

describe("UnfriendConfirmation", () => {
  it("names the friend and leaves removal to the explicit confirmation", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const rendered = elements(UnfriendConfirmation({ friend, busy: false, onCancel, onConfirm }));
    const text = rendered.filter((element) => element.type === Txt)
      .map((element) => Children.toArray((element.props as { children: ReactNode }).children).join(""));
    const buttons = rendered.filter((element) => element.type === Button)
      .map((element) => element.props as { label: string; onPress: () => void; disabled?: boolean; loading?: boolean });

    expect(text).toContain("Unfriend Riley H.?");
    expect(buttons.map((button) => button.label)).toEqual(["Cancel", "Unfriend"]);
    expect(onConfirm).not.toHaveBeenCalled();
    buttons[0]!.onPress();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    buttons[1]!.onPress();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("disables cancellation and shows progress while removal is busy", () => {
    const rendered = elements(UnfriendConfirmation({ friend, busy: true, onCancel: vi.fn(), onConfirm: vi.fn() }));
    const buttons = rendered.filter((element) => element.type === Button)
      .map((element) => element.props as { disabled?: boolean; loading?: boolean });

    expect(buttons[0]!.disabled).toBe(true);
    expect(buttons[1]!.loading).toBe(true);
  });
});
