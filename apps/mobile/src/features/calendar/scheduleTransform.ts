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
  blockId?: string;
  source?: string;
}

export interface ScheduleDayGroup {
  dateKey: string; // YYYY-MM-DD
  dateLabel: string; // e.g., "Today", "Tomorrow", "Thursday, Sep 29"
  items: ScheduleItem[];
}

export function getDateKey(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().split("T")[0]!;
  }
}

export function formatDateLabel(date: Date, timeZone: string, now = new Date()): string {
  const dateKey = getDateKey(date, timeZone);
  const todayKey = getDateKey(now, timeZone);

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  let tomorrowKey = getDateKey(tomorrow, timeZone);
  if (tomorrowKey === todayKey) {
    tomorrowKey = getDateKey(new Date(now.getTime() + 28 * 60 * 60 * 1000), timeZone);
  }

  if (dateKey === todayKey) return "Today";
  if (dateKey === tomorrowKey) return "Tomorrow";

  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(date);
  } catch {
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
}

export function formatTimeRange(startsAt: string, endsAt: string, timeZone: string): string {
  const startD = new Date(startsAt);
  const endD = new Date(endsAt);
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    });
    return `${formatter.format(startD)} – ${formatter.format(endD)}`;
  } catch {
    const startStr = startD.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const endStr = endD.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return `${startStr} – ${endStr}`;
  }
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
  busyBlocks: { id?: string; starts_at: string; ends_at: string; source?: string }[] = [],
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  now: Date = new Date(),
): ScheduleDayGroup[] {
  const tz = timeZone || "UTC";
  const items: ScheduleItem[] = [];

  // Convert free windows
  freeWindows.forEach((f, idx) => {
    items.push({
      id: `free-${idx}-${f.starts_at}`,
      type: "free",
      startsAt: f.starts_at,
      endsAt: f.ends_at,
      title: "Free",
      subtitle: formatTimeRange(f.starts_at, f.ends_at, tz),
    });
  });

  // Convert busy blocks
  busyBlocks.forEach((b, idx) => {
    items.push({
      id: b.id ? `busy-${b.id}` : `busy-${idx}-${b.starts_at}`,
      type: "busy",
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      title: "Busy",
      subtitle: formatTimeRange(b.starts_at, b.ends_at, tz),
      blockId: b.id,
      source: b.source,
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
        subtitle: `${formatTimeRange(evt.starts_at, evt.ends_at, tz)} · ${venueName}`,
        status: evt.status,
        vibeTag: evt.vibe_tag,
        eventId: evt.id,
        venueName,
      });
    });

  // Sort items by startsAt ASC
  items.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  // Group by local calendar date YYYY-MM-DD in the user's timezone
  const groupsMap = new Map<string, ScheduleItem[]>();
  items.forEach((item) => {
    const key = getDateKey(new Date(item.startsAt), tz);
    if (!groupsMap.has(key)) {
      groupsMap.set(key, []);
    }
    groupsMap.get(key)!.push(item);
  });

  const result: ScheduleDayGroup[] = [];
  groupsMap.forEach((dayItems, dateKey) => {
    result.push({
      dateKey,
      dateLabel: formatDateLabel(new Date(dayItems[0].startsAt), tz, now),
      items: dayItems,
    });
  });

  return result;
}
