import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button, Callout, Txt } from "../../ui";
import {
  formatManualDate,
  formatManualTimeRange,
  ManualAvailability,
  ManualAvailabilityView,
  parseDateTime,
} from "./ManualAvailability";
import type { ManualBusyBlockItem } from "@web/contract";

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
  it("exports ManualAvailability and ManualAvailabilityView functions", () => {
    expect(typeof ManualAvailability).toBe("function");
    expect(typeof ManualAvailabilityView).toBe("function");
  });

  it("renders loading state", () => {
    const rendered = elements(
      ManualAvailabilityView({
        blocks: [],
        loading: true,
        onSave: vi.fn(),
        onDeleteBlock: vi.fn(),
      })
    );
    expect(rendered.some((el) => el.type === "ActivityIndicator")).toBe(true);
  });

  it("renders empty state message when no blocks exist", () => {
    const rendered = elements(
      ManualAvailabilityView({
        blocks: [],
        onSave: vi.fn(),
        onDeleteBlock: vi.fn(),
      })
    );
    const texts = rendered
      .filter((el) => el.type === Txt)
      .map((el) => Children.toArray((el.props as { children: ReactNode }).children).join(""));
    expect(texts).toContain("No manual busy times added.");
  });

  it("renders error callout when error prop is provided", () => {
    const rendered = elements(
      ManualAvailabilityView({
        blocks: [],
        error: "Network failure",
        onSave: vi.fn(),
        onDeleteBlock: vi.fn(),
      })
    );
    const callouts = rendered.filter((el) => el.type === Callout);
    expect(callouts.length).toBeGreaterThan(0);
  });

  it("renders manual blocks and allows deleting", () => {
    const onDelete = vi.fn();
    const blocks: ManualBusyBlockItem[] = [
      {
        id: "b-1",
        starts_at: "2026-10-01T13:00:00.000Z",
        ends_at: "2026-10-01T15:00:00.000Z",
        source: "manual",
      },
    ];

    const rendered = elements(
      ManualAvailabilityView({
        blocks,
        onSave: vi.fn(),
        onDeleteBlock: onDelete,
      })
    );

    const deleteBtn = rendered.find(
      (el) => el.type === Button && (el.props as { label: string }).label === "Delete"
    );
    expect(deleteBtn).toBeDefined();

    (deleteBtn?.props as { onPress?: () => void }).onPress?.();
    expect(onDelete).toHaveBeenCalledWith("b-1");
  });

  it("renders add block form when isAdding is true", () => {
    const onSave = vi.fn();
    const rendered = elements(
      ManualAvailabilityView({
        blocks: [],
        isAdding: true,
        onSave,
      })
    );
    const texts = rendered
      .filter((el) => el.type === Txt)
      .map((el) => Children.toArray((el.props as { children: ReactNode }).children).join(""));
    expect(texts).toContain("Add Busy Block");

    const saveBtn = rendered.find(
      (el) => el.type === Button && (el.props as { label: string }).label === "Save Busy Time"
    );
    expect(saveBtn).toBeDefined();
    (saveBtn?.props as { onPress?: () => void }).onPress?.();
    expect(onSave).toHaveBeenCalled();
  });
});
