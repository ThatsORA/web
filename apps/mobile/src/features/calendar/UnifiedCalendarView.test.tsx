import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Txt } from "../../ui";
import {
  UnifiedCalendarView,
  UnifiedScheduleView,
} from "./UnifiedCalendarView";
import type { ScheduleDayGroup } from "./scheduleTransform";

vi.mock("react-native", () => ({
  View: "View",
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("../../ui", () => ({
  Badge: (props: any) => ({ type: "Badge", props }),
  Card: (props: any) => ({ type: "Card", props }),
  Txt: (props: any) => ({ type: "Txt", props }),
  useTheme: () => ({
    colors: {
      primary: "#6A00F4",
      primarySoft: "#EBDDFF",
      primarySofter: "#F6F0FF",
      surfaceMuted: "#EFEAFB",
      border: "#E4DDF5",
      borderStrong: "#CBC2E3",
      heading: "#140A2E",
      textMuted: "#6B6584",
      link: "#6A00F4",
      onPrimary: "#FFFFFF",
    },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24 },
    radius: { sm: 1, pill: 999 },
  }),
}));

vi.mock("../../lib/api", () => ({
  api: vi.fn(),
}));

function elements(node: ReactNode): ReactElement[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement(child) ? [child, ...elements((child.props as { children?: ReactNode }).children)] : []
  );
}

describe("UnifiedCalendarView & UnifiedScheduleView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports UnifiedCalendarView and UnifiedScheduleView functions", () => {
    expect(typeof UnifiedCalendarView).toBe("function");
    expect(typeof UnifiedScheduleView).toBe("function");
  });

  it("renders loading indicator when loading is true", () => {
    const rendered = elements(UnifiedScheduleView({ schedule: null, loading: true }));
    const indicators = rendered.filter((el) => el.type === "ActivityIndicator");
    expect(indicators.length).toBeGreaterThan(0);
  });

  it("renders error text when error is true", () => {
    const rendered = elements(UnifiedScheduleView({ schedule: null, error: true }));
    const texts = rendered
      .filter((el) => el.type === Txt)
      .map((el) => Children.toArray((el.props as { children: ReactNode }).children).join(""));
    expect(texts).toContain("Failed to load schedule.");
  });

  it("renders empty state message when schedule has no items", () => {
    const rendered = elements(UnifiedScheduleView({ schedule: [] }));
    const texts = rendered
      .filter((el) => el.type === Txt)
      .map((el) => Children.toArray((el.props as { children: ReactNode }).children).join(""));
    expect(texts).toContain("No upcoming free windows, busy blocks or hangouts scheduled.");
  });

  it("renders schedule with free windows, busy blocks, and hangouts", () => {
    const onSelect = vi.fn();
    const schedule: ScheduleDayGroup[] = [
      {
        dateKey: "2026-10-01",
        dateLabel: "Today",
        items: [
          {
            id: "free-1",
            type: "free",
            startsAt: "2026-10-01T09:00:00.000Z",
            endsAt: "2026-10-01T12:00:00.000Z",
            title: "Free",
            subtitle: "9:00 AM – 12:00 PM",
          },
          {
            id: "busy-1",
            type: "busy",
            startsAt: "2026-10-01T13:00:00.000Z",
            endsAt: "2026-10-01T14:00:00.000Z",
            title: "Busy",
            subtitle: "1:00 PM – 2:00 PM",
          },
          {
            id: "event-1",
            type: "hangout",
            startsAt: "2026-10-01T18:00:00.000Z",
            endsAt: "2026-10-01T20:00:00.000Z",
            title: "Dinner Hangout",
            subtitle: "6:00 PM – 8:00 PM · Sergio's Pizza",
            status: "confirmed",
            eventId: "evt-123",
          },
        ],
      },
    ];

    const rendered = elements(
      UnifiedScheduleView({
        schedule,
        onSelectEvent: onSelect,
      })
    );

    const texts = rendered
      .filter((el) => el.type === Txt)
      .map((el) => Children.toArray((el.props as { children: ReactNode }).children).join(""));

    // Legend items
    expect(texts).toContain("Free");
    expect(texts).toContain("Busy");
    expect(texts).toContain("Hangout");

    const txtElements = rendered.filter((el) => el.type === Txt);
    const freeLegend = txtElements.find(
      (el) => Children.toArray((el.props as { children: ReactNode }).children).join("") === "Free"
    );
    expect((freeLegend?.props as { color?: string })?.color).toBe("textMuted");

    const busyLegend = txtElements.find(
      (el) => Children.toArray((el.props as { children: ReactNode }).children).join("") === "Busy"
    );
    expect((busyLegend?.props as { color?: string })?.color).toBe("textMuted");

    // Day label
    expect(texts).toContain("Today");

    // Item details
    expect(texts).toContain("9:00 AM – 12:00 PM");
    expect(texts).toContain("1:00 PM – 2:00 PM");
    expect(texts).toContain("✨ Dinner Hangout");
    expect(texts).toContain("6:00 PM – 8:00 PM · Sergio's Pizza");

    // Pressable hangout interaction
    const pressables = rendered
      .filter((el) => el.type === "Pressable")
      .map((el) => el.props as { onPress?: () => void });

    expect(pressables.length).toBeGreaterThan(0);
    pressables[0]?.onPress?.();
    expect(onSelect).toHaveBeenCalledWith("evt-123");
  });
});
