import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button, Callout, Modal } from "../../ui";
import {
  busyBlockRange,
  combineDayAndTime,
  formatPickerValue,
  ManualAvailabilityView,
  type ManualAvailabilityViewProps,
} from "./ManualAvailability";

vi.mock("react-native", () => ({ View: "View", Platform: { OS: "ios" } }));
vi.mock("@react-native-community/datetimepicker", () => ({ default: "DateTimePicker", DateTimePickerAndroid: { open: vi.fn() } }));
vi.mock("expo-localization", () => ({ getCalendars: () => [{ uses24hourClock: false }] }));

vi.mock("../../ui", () => ({
  Button: (props: any) => ({ type: Button, props }),
  Callout: (props: any) => ({ type: Callout, props }),
  Modal: (props: any) => ({ type: Modal, props }),
  Txt: (props: any) => ({ type: "Txt", props }),
  useTheme: () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24 } }),
}));

function elements(node: ReactNode): ReactElement[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement(child) ? [child, ...elements((child.props as { children?: ReactNode }).children)] : []
  );
}

const day = new Date(2026, 9, 1); // Thu, Oct 1 2026
const at = (h: number, m = 0) => new Date(2020, 0, 1, h, m);

describe("manual busy time helpers", () => {
  it("puts the picked time on the picked day", () => {
    const d = combineDayAndTime(day, at(14, 30));
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 9, 1, 14, 30]);
  });

  it("builds the busy range on the picked day, and refuses an end at or before the start", () => {
    const range = busyBlockRange(day, at(9), at(17));
    expect(range).toEqual({ startsAt: new Date(2026, 9, 1, 9), endsAt: new Date(2026, 9, 1, 17) });
    expect(busyBlockRange(day, at(17), at(9))).toEqual({ error: "Start time must be before end time." });
    expect(busyBlockRange(day, at(9), at(9))).toEqual({ error: "Start time must be before end time." });
  });

  it("shows times in 12-hour form unless the phone uses a 24-hour clock", () => {
    expect(formatPickerValue(at(17, 5), "time", false)).toMatch(/5:05\s?PM/i);
    expect(formatPickerValue(at(17, 5), "time", true)).toMatch(/^17:05$/);
    expect(formatPickerValue(day, "date", false)).toMatch(/Oct/);
  });
});

describe("ManualAvailabilityView", () => {
  const props = (overrides: Partial<ManualAvailabilityViewProps> = {}): ManualAvailabilityViewProps => ({
    open: false, onOpen: vi.fn(), onClose: vi.fn(), day, onChangeDay: vi.fn(),
    start: at(9), onChangeStart: vi.fn(), end: at(17), onChangeEnd: vi.fn(), onSave: vi.fn(), ...overrides,
  });

  it("opens its own modal from the '+ Manually add busy time' button", () => {
    const onOpen = vi.fn();
    const rendered = elements(ManualAvailabilityView(props({ onOpen })));
    const add = rendered.find((el) => el.type === Button && (el.props as { label: string }).label === "+ Add busy time");
    (add?.props as { onPress: () => void }).onPress();
    expect(onOpen).toHaveBeenCalled();
    expect((rendered.find((el) => el.type === Modal)?.props as { visible: boolean }).visible).toBe(false);
  });

  it("asks for a date and start and end times with native pickers, then saves", () => {
    const onSave = vi.fn();
    const rendered = elements(ManualAvailabilityView(props({ open: true, onSave })));
    const modal = rendered.find((el) => el.type === Modal)!;
    expect(modal.props).toMatchObject({ visible: true, title: "Add busy time" });
    const fields = rendered.filter((el) => typeof el.type === "function" && "mode" in (el.props as object));
    expect(fields.map((el) => [(el.props as { label: string }).label, (el.props as { mode: string }).mode])).toEqual([
      ["Date", "date"], ["Start", "time"], ["End", "time"],
    ]);
    const save = rendered.find((el) => el.type === Button && (el.props as { label: string }).label === "Save busy time");
    (save?.props as { onPress: () => void }).onPress();
    expect(onSave).toHaveBeenCalled();
  });

  it("shows why a busy time can't be saved", () => {
    const rendered = elements(ManualAvailabilityView(props({ open: true, validationError: "Start time must be before end time." })));
    expect(rendered.some((el) => el.type === Callout)).toBe(true);
  });
});
