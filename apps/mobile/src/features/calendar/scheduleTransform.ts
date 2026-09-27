// Pure data transformation for combining calendar busy blocks, free windows, and Web Hangouts into a unified schedule.
import type { EventCardPayload } from "@web/contract";

export interface ScheduleItem {
  id: string;
  type: "busy" | "free" | "hangout";
  startsAt: string;
  endsAt: string;
  title: string;
  subtitle?: string;
  status?: EventCardPayload["status"];
  vibeTag?: EventCardPayload["vibe_tag"];
  eventId?: string;
  venueName?: string;
}

export interface ScheduleDayGroup {
  dateKey: string; // YYYY-MM-DD
  dateLabel: string; // e.g., "Today", "Tomorrow", "Thursday, Sep 29"
  items: ScheduleItem[];
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  const dateKey = dateStr.split("T")[0];
  if (dateKey === todayStr) return "Today";
  if (dateKey === tomorrowStr) return "Tomorrow";

  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTimeRange(startsAt: string, endsAt: string): string {
  const startD = new Date(startsAt);
  const endD = new Date(endsAt);
  const startStr = startD.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const endStr = endD.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${startStr} – ${endStr}`;
}

function formatVibeName(vibe: string): string {
  switch (vibe) {
    case "quick_coffee": return "Coffee";
    case "casual_hangout": return "Casual";
    case "dinner": return "Dinner";
    case "night_out": return "Night Out";
    default: return vibe;
  }
}

export function transformScheduleItems(
  freeWindows: { starts_at: string; ends_at: string }[] = [],
  events: EventCardPayload[] = [],
  busyBlocks: { starts_at: string; ends_at: string }[] = []
): ScheduleDayGroup[] {
  const items: ScheduleItem[] = [];

  // Convert free windows
  freeWindows.forEach((f, idx) => {
    items.push({
      id: `free-${idx}-${f.starts_at}`,
      type: "free",
      startsAt: f.starts_at,
      endsAt: f.ends_at,
      title: "Free",
      subtitle: formatTimeRange(f.starts_at, f.ends_at),
    });
  });

  // Convert busy blocks
  busyBlocks.forEach((b, idx) => {
    items.push({
      id: `busy-${idx}-${b.starts_at}`,
      type: "busy",
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      title: "Busy",
      subtitle: formatTimeRange(b.starts_at, b.ends_at),
    });
  });

  // Convert hangouts (only confirmed hangouts)
  events
    .filter((evt) => evt.status === "confirmed")
    .forEach((evt) => {
      const venueName = evt.outcome?.venue?.name || (evt.options && evt.options[0]?.name) || "Venue TBD";
      items.push({
        id: `event-${evt.id}`,
        type: "hangout",
        startsAt: evt.starts_at,
        endsAt: evt.ends_at,
        title: `${formatVibeName(evt.vibe_tag)} Hangout`,
        subtitle: `${formatTimeRange(evt.starts_at, evt.ends_at)} · ${venueName}`,
        status: evt.status,
        vibeTag: evt.vibe_tag,
        eventId: evt.id,
        venueName,
      });
    });

  // Sort items by startsAt ASC
  items.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  // Group by YYYY-MM-DD
  const groupsMap = new Map<string, ScheduleItem[]>();
  items.forEach((item) => {
    const key = item.startsAt.split("T")[0];
    if (!groupsMap.has(key)) {
      groupsMap.set(key, []);
    }
    groupsMap.get(key)!.push(item);
  });

  const result: ScheduleDayGroup[] = [];
  groupsMap.forEach((dayItems, dateKey) => {
    result.push({
      dateKey,
      dateLabel: formatDateLabel(dayItems[0].startsAt),
      items: dayItems,
    });
  });

  return result;
}
