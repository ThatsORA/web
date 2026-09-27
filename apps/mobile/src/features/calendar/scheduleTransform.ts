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

export interface Interval {
  start: number;
  end: number;
}

/** Subtracts a blocker interval from a source interval, returning 0, 1, or 2 remaining intervals. */
export function subtractInterval(source: Interval, blocker: Interval): Interval[] {
  if (blocker.end <= source.start || blocker.start >= source.end) {
    return [source];
  }
  if (blocker.start <= source.start && blocker.end >= source.end) {
    return [];
  }
  if (blocker.start > source.start && blocker.end < source.end) {
    return [
      { start: source.start, end: blocker.start },
      { start: blocker.end, end: source.end },
    ];
  }
  if (blocker.start <= source.start && blocker.end < source.end) {
    return [{ start: blocker.end, end: source.end }];
  }
  if (blocker.start > source.start && blocker.end >= source.end) {
    return [{ start: source.start, end: blocker.start }];
  }
  return [source];
}

/** Subtracts multiple blocker intervals from a list of source intervals. */
export function subtractIntervals(sources: Interval[], blockers: Interval[]): Interval[] {
  let result = sources;
  for (const blocker of blockers) {
    const next: Interval[] = [];
    for (const src of result) {
      next.push(...subtractInterval(src, blocker));
    }
    result = next;
  }
  // Filter out any negligible intervals (< 5 minutes)
  return result.filter((i) => i.end - i.start >= 5 * 60 * 1000);
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

  // Filter confirmed hangouts
  const confirmedEvents = events.filter((evt) => evt.status === "confirmed");

  // Hangout intervals take highest priority
  const hangoutIntervals: Interval[] = confirmedEvents.map((evt) => ({
    start: new Date(evt.starts_at).getTime(),
    end: new Date(evt.ends_at).getTime(),
  }));

  // Filter out busy blocks completely covered by confirmed hangouts (e.g. from calendar sync)
  const activeBusy = busyBlocks.filter((b) => {
    const bStart = new Date(b.starts_at).getTime();
    const bEnd = new Date(b.ends_at).getTime();
    return !hangoutIntervals.some((h) => h.start <= bStart && h.end >= bEnd);
  });

  const busyIntervals: Interval[] = activeBusy.map((b) => ({
    start: new Date(b.starts_at).getTime(),
    end: new Date(b.ends_at).getTime(),
  }));

  // Reconcile free windows by subtracting both confirmed hangouts and active busy blocks
  const blockers = [...hangoutIntervals, ...busyIntervals];
  const rawFreeIntervals: Interval[] = freeWindows.map((f) => ({
    start: new Date(f.starts_at).getTime(),
    end: new Date(f.ends_at).getTime(),
  }));

  const reconciledFree = subtractIntervals(rawFreeIntervals, blockers);

  // Add reconciled free windows
  reconciledFree.forEach((f, idx) => {
    const startsAt = new Date(f.start).toISOString();
    const endsAt = new Date(f.end).toISOString();
    items.push({
      id: `free-${idx}-${startsAt}`,
      type: "free",
      startsAt,
      endsAt,
      title: "Free",
      subtitle: formatTimeRange(startsAt, endsAt, tz),
    });
  });

  // Add active busy blocks
  activeBusy.forEach((b, idx) => {
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

  // Add confirmed hangouts
  confirmedEvents.forEach((evt) => {
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
