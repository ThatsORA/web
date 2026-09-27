// Owner: Riley — core time math (plan §3 Free windows, §4 Vibe tag + slot).
// Pure TypeScript: no DB access, all time math uses instants (Date) internally,
// and local-time logic uses the IANA timezone.
import type { VibeTag } from "@web/contract";

export interface Interval {
  start: Date;
  end: Date;
}

type TimeValue = Date | string | number;

export interface TimeWindowInput {
  start: TimeValue;
  end: TimeValue;
}

export interface TimeWindow {
  start: Date;
  end: Date;
}

export interface MemberAvailability {
  id?: string;
  timezone?: string;
  busyBlocks?: TimeWindowInput[];
  openEvents?: TimeWindowInput[];
}

export interface FreeWindowsConfig {
  busyPaddingMin?: number;
  minLeadHours?: number;
  horizonDays?: number;
  timezone?: string;
}

export interface ClassifiedSlot {
  vibe_tag: VibeTag;
  start: Date;
  end: Date;
  durationMinutes: number;
}

export interface VibeTemplate {
  vibe_tag: VibeTag;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  earliestStart: (weekday: string) => { hour: number; minute: number };
  latestStart: { hour: number; minute: number };
  placesTypes: string[];
  priceRange: [number, number];
}

export const VIBE_TEMPLATES: Record<VibeTag, VibeTemplate> = {
  quick_coffee: {
    vibe_tag: "quick_coffee",
    minDurationMinutes: 45,
    maxDurationMinutes: 60,
    earliestStart: () => ({ hour: 8, minute: 0 }),
    latestStart: { hour: 16, minute: 30 },
    placesTypes: ["cafe", "coffee_shop"],
    priceRange: [1, 2],
  },
  casual_hangout: {
    vibe_tag: "casual_hangout",
    minDurationMinutes: 60,
    maxDurationMinutes: 120,
    earliestStart: () => ({ hour: 10, minute: 0 }),
    latestStart: { hour: 20, minute: 30 },
    placesTypes: ["cafe", "bakery", "restaurant"],
    priceRange: [1, 2],
  },
  dinner: {
    vibe_tag: "dinner",
    minDurationMinutes: 90,
    maxDurationMinutes: 120,
    earliestStart: () => ({ hour: 17, minute: 30 }),
    latestStart: { hour: 20, minute: 0 },
    placesTypes: ["restaurant"],
    priceRange: [2, 3],
  },
  night_out: {
    vibe_tag: "night_out",
    minDurationMinutes: 120,
    maxDurationMinutes: 180,
    earliestStart: (weekday: string) =>
      weekday === "Fri" || weekday === "Sat" ? { hour: 19, minute: 0 } : { hour: 20, minute: 0 },
    latestStart: { hour: 22, minute: 0 },
    placesTypes: ["bar", "night_club", "bowling_alley"],
    priceRange: [2, 4],
  },
};

export const WEEKEND_PRIORITY: VibeTag[] = ["night_out", "dinner", "casual_hangout", "quick_coffee"];
export const WEEKDAY_PRIORITY: VibeTag[] = ["dinner", "night_out", "casual_hangout", "quick_coffee"];

export interface LocalTimeParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
  weekday: "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";
}

/**
 * Extracts local calendar parts for an instant in the specified IANA timezone.
 */
export function getLocalParts(date: Date, tz: string): LocalTimeParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts: Partial<Record<string, string | number>> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") {
      parts[p.type] = p.type === "weekday" ? p.value : parseInt(p.value, 10);
    }
  }
  return parts as unknown as LocalTimeParts;
}

/**
 * Converts a local wall-clock date/time in an IANA timezone into a UTC Date instant.
 * Handles DST transitions robustly.
 */
export function localToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
  second = 0
): Date {
  const targetLocalMs = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = new Date(targetLocalMs);
  for (let i = 0; i < 4; i++) {
    const p = getLocalParts(guess, tz);
    const localMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second || 0);
    const offset = localMs - guess.getTime();
    const nextGuess = new Date(targetLocalMs - offset);
    if (nextGuess.getTime() === guess.getTime()) break;
    guess = nextGuess;
  }
  return guess;
}

/**
 * Format a Date to "HH:MM" (24-hour) in the specified IANA timezone.
 */
export function formatTimeHHMM(date: Date, tz: string): string {
  const parts = getLocalParts(date, tz);
  const hh = String(parts.hour).padStart(2, "0");
  const mm = String(parts.minute).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** The timezone whose local wall clock is earliest at an instant. */
export function earliestTimezone(date: Date, timezones: readonly string[]): string {
  const unique = [...new Set(timezones)];
  if (!unique.length) return "America/New_York";
  return unique.sort((a, b) => {
    const aParts = getLocalParts(date, a);
    const bParts = getLocalParts(date, b);
    const aLocal = Date.UTC(aParts.year, aParts.month - 1, aParts.day, aParts.hour, aParts.minute, aParts.second);
    const bLocal = Date.UTC(bParts.year, bParts.month - 1, bParts.day, bParts.hour, bParts.minute, bParts.second);
    return aLocal - bLocal || a.localeCompare(b);
  })[0]!;
}

/**
 * Merges overlapping or abutting time intervals into disjoint intervals.
 */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) {
    return [];
  }
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const first = sorted[0];
  if (!first) return [];
  const merged: Interval[] = [{ start: new Date(first.start), end: new Date(first.end) }];

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const prev = merged[merged.length - 1];
    if (!cur || !prev) continue;
    if (cur.start.getTime() <= prev.end.getTime()) {
      if (cur.end.getTime() > prev.end.getTime()) {
        prev.end = new Date(cur.end);
      }
    } else {
      merged.push({ start: new Date(cur.start), end: new Date(cur.end) });
    }
  }
  return merged;
}

/**
 * Subtracts a list of busy intervals from a list of source windows.
 */
export function subtractIntervals(sourceWindows: Interval[], busyIntervals: Interval[]): TimeWindow[] {
  const mergedBusy = mergeIntervals(busyIntervals);
  const free: TimeWindow[] = [];

  for (const win of sourceWindows) {
    let curMs = win.start.getTime();
    const winEndMs = win.end.getTime();

    for (const b of mergedBusy) {
      const bStartMs = b.start.getTime();
      const bEndMs = b.end.getTime();

      if (bEndMs <= curMs) {
        continue;
      }
      if (bStartMs >= winEndMs) {
        break;
      }
      if (bStartMs > curMs) {
        const chunkEndMs = Math.min(bStartMs, winEndMs);
        if (curMs < chunkEndMs) {
          free.push({
            start: new Date(curMs),
            end: new Date(chunkEndMs),
          });
        }
      }
      curMs = Math.max(curMs, bEndMs);
      if (curMs >= winEndMs) {
        break;
      }
    }

    if (curMs < winEndMs) {
      free.push({
        start: new Date(curMs),
        end: new Date(winEndMs),
      });
    }
  }

  return free;
}

/**
 * Intersects two sorted disjoint lists of time windows.
 */
export function intersectWindows(listA: TimeWindow[], listB: TimeWindow[]): TimeWindow[] {
  let i = 0;
  let j = 0;
  const result: TimeWindow[] = [];

  while (i < listA.length && j < listB.length) {
    const a = listA[i];
    const b = listB[j];
    if (!a || !b) break;
    const startMs = Math.max(a.start.getTime(), b.start.getTime());
    const endMs = Math.min(a.end.getTime(), b.end.getTime());

    if (startMs < endMs) {
      result.push({
        start: new Date(startMs),
        end: new Date(endMs),
      });
    }

    if (a.end.getTime() < b.end.getTime()) {
      i++;
    } else {
      j++;
    }
  }

  return result;
}

/**
 * Computes the waking hours intervals (08:00–24:00 local time) clamped to [rangeStart, rangeEnd].
 */
export function wakingHoursForRange(rangeStart: Date, rangeEnd: Date, tz: string): Interval[] {
  if (rangeStart.getTime() >= rangeEnd.getTime()) {
    return [];
  }

  const startParts = getLocalParts(rangeStart, tz);

  const intervals: Interval[] = [];

  // Iterate over calendar days from startParts to rangeEnd
  let curYear = startParts.year;
  let curMonth = startParts.month;
  let curDay = startParts.day;

  // Safeguard loop counter (horizon is max 7-14 days)
  for (let step = 0; step < 30; step++) {
    const dayWakingStart = localToUtc(curYear, curMonth, curDay, 8, 0, tz);
    const dayWakingEnd = localToUtc(curYear, curMonth, curDay + 1, 0, 0, tz); // 24:00 is 00:00 next day

    if (dayWakingStart.getTime() > rangeEnd.getTime()) {
      break;
    }

    const clampedStartMs = Math.max(dayWakingStart.getTime(), rangeStart.getTime());
    const clampedEndMs = Math.min(dayWakingEnd.getTime(), rangeEnd.getTime());

    if (clampedStartMs < clampedEndMs) {
      intervals.push({
        start: new Date(clampedStartMs),
        end: new Date(clampedEndMs),
      });
    }

    // Advance to next calendar day
    const nextDayDate = new Date(dayWakingStart.getTime() + 28 * 3600 * 1000);
    const nextParts = getLocalParts(nextDayDate, tz);
    curYear = nextParts.year;
    curMonth = nextParts.month;
    curDay = nextParts.day;

    if (dayWakingEnd.getTime() >= rangeEnd.getTime()) {
      break;
    }
  }

  return intervals;
}

function toDateInterval(item: TimeWindowInput): Interval | null {
  const start = new Date(item.start);
  const end = new Date(item.end);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start.getTime() >= end.getTime()) {
    return null;
  }
  return { start, end };
}

/**
 * Core matching time math: freeWindows (plan §3).
 *
 * 1. For each member, pad every busy block by BUSY_PADDING_MIN (default 15m) on each side.
 * 2. Add the slot of every open event (voting or confirmed) the member belongs to.
 * 3. Free = waking hours (08:00–24:00 local) minus the merged busy set, within range [now + 2h, now + 7d].
 * 4. The group's free windows are the intersection across all members.
 */
export function freeWindows(
  members: MemberAvailability[],
  now: Date | string | number = new Date(),
  cfg?: FreeWindowsConfig
): TimeWindow[] {
  if (!members || members.length === 0) {
    return [];
  }

  const nowDate = new Date(now);
  const busyPaddingMin = cfg?.busyPaddingMin ?? 15;
  const minLeadHours = cfg?.minLeadHours ?? 2;
  const horizonDays = cfg?.horizonDays ?? 7;
  const defaultTz = cfg?.timezone ?? members[0]?.timezone ?? "America/New_York";

  const rangeStart = new Date(nowDate.getTime() + minLeadHours * 60 * 60 * 1000);
  const rangeEnd = new Date(nowDate.getTime() + horizonDays * 24 * 60 * 60 * 1000);

  if (rangeStart.getTime() >= rangeEnd.getTime()) {
    return [];
  }

  const paddingMs = busyPaddingMin * 60 * 1000;

  // Compute free windows for each member
  const memberFreeWindows: TimeWindow[][] = members.map((member) => {
    const tz = member.timezone ?? defaultTz;
    const waking = wakingHoursForRange(rangeStart, rangeEnd, tz);

    const busyIntervals: Interval[] = [];

    // 1. Busy blocks padded by BUSY_PADDING_MIN
    for (const b of member.busyBlocks ?? []) {
      const iv = toDateInterval(b);
      if (iv) {
        busyIntervals.push({
          start: new Date(iv.start.getTime() - paddingMs),
          end: new Date(iv.end.getTime() + paddingMs),
        });
      }
    }

    // 2. Open-event slots (unpadded)
    for (const e of member.openEvents ?? []) {
      const iv = toDateInterval(e);
      if (iv) {
        busyIntervals.push(iv);
      }
    }

    // 3. Free = waking hours minus merged busy set
    return subtractIntervals(waking, busyIntervals);
  });

  // 4. Intersect across all members
  let groupFree: TimeWindow[] = memberFreeWindows[0] ?? [];
  for (let m = 1; m < memberFreeWindows.length; m++) {
    const nextWindows = memberFreeWindows[m];
    if (!nextWindows) continue;
    groupFree = intersectWindows(groupFree, nextWindows);
    if (groupFree.length === 0) break;
  }

  return groupFree;
}

/**
 * Core matching time math: feasibleSlots (plan §4).
 *
 * Evaluates template feasibility for a free window in every member's local time:
 * - s = the latest of W.start and each member's template earliest start, rounded up to 15 min.
 * - len = min(template max duration, W.end - s).
 * - Feasible if s <= every member's template latest start and len >= template min duration.
 * - Returns the slot [s, s + len] of every feasible template, in VIBE_TEMPLATES order.
 */
export function feasibleSlots(
  window: TimeWindowInput,
  timezone: string | readonly string[] = "America/New_York",
): ClassifiedSlot[] {
  const start = new Date(window.start);
  const end = new Date(window.end);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start.getTime() >= end.getTime()) {
    return [];
  }

  const timezones = typeof timezone === "string" ? [timezone] : [...new Set(timezone)];
  if (!timezones.length) return [];

  const FIFTEEN_MIN_MS = 15 * 60 * 1000;
  const feasible: ClassifiedSlot[] = [];

  for (const [tag, tmpl] of Object.entries(VIBE_TEMPLATES) as Array<[VibeTag, VibeTemplate]>) {
    let rawStartMs = start.getTime();
    let latestStartMs = end.getTime();
    for (const tz of timezones) {
      const local = getLocalParts(start, tz);
      const earliest = tmpl.earliestStart(local.weekday);
      const latest = tmpl.latestStart;
      rawStartMs = Math.max(
        rawStartMs,
        localToUtc(local.year, local.month, local.day, earliest.hour, earliest.minute, tz).getTime(),
      );
      latestStartMs = Math.min(
        latestStartMs,
        localToUtc(local.year, local.month, local.day, latest.hour, latest.minute, tz).getTime(),
      );
    }
    const sMs = Math.ceil(rawStartMs / FIFTEEN_MIN_MS) * FIFTEEN_MIN_MS;
    const s = new Date(sMs);

    const remainingMs = end.getTime() - sMs;
    const remainingMinutes = Math.floor(remainingMs / (60 * 1000));
    const lenMinutes = Math.min(tmpl.maxDurationMinutes, remainingMinutes);

    if (sMs <= latestStartMs && lenMinutes >= tmpl.minDurationMinutes) {
      const slotEnd = new Date(sMs + lenMinutes * 60 * 1000);
      feasible.push({
        vibe_tag: tag,
        start: s,
        end: slotEnd,
        durationMinutes: lenMinutes,
      });
    }
  }

  return feasible;
}

/**
 * Core matching time math: classifySlot (plan §4).
 *
 * Picks one of `feasibleSlots` by priority, based on the weekday of the earliest local timezone:
 *   - Fri/Sat: night_out > dinner > casual_hangout > quick_coffee
 *   - Sun–Thu: dinner > night_out > casual_hangout > quick_coffee
 * - Returns the slot [s, s + len] or null if discarded.
 * - With `vibe`, only that template counts: its slot is returned whenever it is feasible.
 */
export function classifySlot(
  window: TimeWindowInput,
  timezone: string | readonly string[] = "America/New_York",
  vibe?: VibeTag,
): ClassifiedSlot | null {
  const feasible = feasibleSlots(window, timezone);
  if (!feasible.length) return null;

  const start = new Date(window.start);
  const timezones = typeof timezone === "string" ? [timezone] : timezone;
  const weekday = getLocalParts(start, earliestTimezone(start, timezones)).weekday;

  // Priority is chosen by the local weekday of s
  const isWeekend = weekday === "Fri" || weekday === "Sat";
  const priority = vibe ? [vibe] : isWeekend ? WEEKEND_PRIORITY : WEEKDAY_PRIORITY;

  for (const tag of priority) {
    const slot = feasible.find((f) => f.vibe_tag === tag);
    if (slot) {
      return slot;
    }
  }

  return null;
}
