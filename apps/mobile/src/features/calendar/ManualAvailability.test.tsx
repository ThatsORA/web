import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button, Callout, Txt } from "../../ui";
import {
  formatManualDate,
  formatManualTimeRange,
  ManualAvailability,
  ManualAvailabilityView,
  parseDateTime,
  TIME_PRESETS,
} from "./ManualAvailability";

vi.mock("react-native", () => ({
  View: "View",
  ActivityIndicator: "ActivityIndicator",
  TextInput: "TextInput",
  Pressable: "Pressable",
}));

vi.mock("../../ui", () => ({
  Button: (props: any) => ({ type: Button, props }),
  Callout: (props: any) => ({ type: Callout, props }),
  Card: (props: any) => ({ type: "Card", props }),
  TextField: (props: any) => ({ type: "TextField", props }),
  Txt: (props: any) => ({ type: Txt, props }),
  useTheme: () => ({
    colors: {
      primary: "#6A00F4",
      primarySoft: "#EBDDFF",
      primarySofter: "#F6F0FF",
      surfaceMuted: "#EFEAFB",
      surface: "#FFFFFF",
      border: "#E4DDF5",
      borderStrong: "#CBC2E3",
      heading: "#140A2E",
      textMuted: "#6B6584",
      danger: "#D12420",
    },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24 },
    radius: { sm: 4, pill: 999 },
  }),
}));

function elements(node: ReactNode): ReactElement[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement(child) ? [child, ...elements((child.props as { children?: ReactNode }).children)] : []
  );
}

describe("ManualAvailability datetime helpers", () => {
  it("parses 24h and 12h time formats correctly", () => {
    const d1 = parseDateTime("2026-10-01", "14:30");
    expect(d1).not.toBeNull();
    expect(d1?.getFullYear()).toBe(2026);
    expect(d1?.getMonth()).toBe(9); // October is 9
    expect(d1?.getDate()).toBe(1);
    expect(d1?.getHours()).toBe(14);
    expect(d1?.getMinutes()).toBe(30);

    const d2 = parseDateTime("2026-10-01", "9:15 AM");
    expect(d2?.getHours()).toBe(9);
    expect(d2?.getMinutes()).toBe(15);

    const d3 = parseDateTime("2026-10-01", "12:00 PM");
    expect(d3?.getHours()).toBe(12);

    const d4 = parseDateTime("2026-10-01", "12:00 AM");
    expect(d4?.getHours()).toBe(0);

    const d5 = parseDateTime("2026-10-01", "3 PM");
    expect(d5?.getHours()).toBe(15);
  });

  it("returns null for invalid inputs", () => {
    expect(parseDateTime("", "10:00")).toBeNull();
    expect(parseDateTime("2026-10-01", "")).toBeNull();
    expect(parseDateTime("invalid-date", "10:00")).toBeNull();
    expect(parseDateTime("2026-10-01", "25:00")).toBeNull();
    expect(parseDateTime("2026-10-01", "invalid-time")).toBeNull();
  });

  it("formats date and time range properly", () => {
    const s = "2026-10-01T14:00:00.000Z";
    const e = "2026-10-01T16:00:00.000Z";
    expect(formatManualDate(s)).toBeDefined();
    expect(formatManualTimeRange(s, e)).toContain("–");
  });
});

describe("ManualAvailabilityView", () => {
  it("exports ManualAvailability, ManualAvailabilityView and TIME_PRESETS", () => {
    expect(typeof ManualAvailability).toBe("function");
    expect(typeof ManualAvailabilityView).toBe("function");
    expect(TIME_PRESETS.length).toBe(4);
    expect(TIME_PRESETS.map((p) => p.label)).toEqual([
      "Morning 9am-12pm",
      "Afternoon 12pm-5pm",
      "Evening 5pm-9pm",
      "Full Day 9am-5pm",
    ]);
  });

  it("renders error callout when error prop is provided", () => {
    const rendered = elements(
      ManualAvailabilityView({
        error: "Network failure",
        onSave: vi.fn(),
      })
    );
    const callouts = rendered.filter((el) => el.type === Callout);
    expect(callouts.length).toBeGreaterThan(0);
  });

  it("renders add block form with date and time presets when isAdding is true", () => {
    const onSave = vi.fn();
    const onChangeStart = vi.fn();
    const onChangeEnd = vi.fn();

    const rendered = elements(
      ManualAvailabilityView({
        isAdding: true,
        onSave,
        onChangeStartTimeStr: onChangeStart,
        onChangeEndTimeStr: onChangeEnd,
      })
    );
    const texts = rendered
      .filter((el) => el.type === Txt)
      .map((el) => Children.toArray((el.props as { children: ReactNode }).children).join(""));
    expect(texts).toContain("Add Busy Block");
    expect(texts).toContain("Date Presets");
    expect(texts).toContain("Time Presets");

    const buttons = rendered.filter((el) => el.type === Button);
    const morningBtn = buttons.find(
      (el) => (el.props as { label: string }).label === "Morning 9am-12pm"
    );
    expect(morningBtn).toBeDefined();

    (morningBtn?.props as { onPress?: () => void }).onPress?.();
    expect(onChangeStart).toHaveBeenCalledWith("09:00");
    expect(onChangeEnd).toHaveBeenCalledWith("12:00");

    const saveBtn = buttons.find(
      (el) => (el.props as { label: string }).label === "Save Busy Time"
    );
    expect(saveBtn).toBeDefined();
    (saveBtn?.props as { onPress?: () => void }).onPress?.();
    expect(onSave).toHaveBeenCalled();
  });
});
