import { getLocalParts, localToUtc, type TimeWindow } from "../src/modules/matching/timeMath";

export const DEMO_TIMEZONE = "America/New_York";
export const DEMO_PASSWORD = "web-demo-2026";
export const DEMO_USERS = [
  {
    username: "riley",
    email: "riley@web.demo",
    homeLat: 25.781,
    homeLng: -80.36,
  },
  {
    username: "ojas",
    email: "ojas@web.demo",
    homeLat: 25.7,
    homeLng: -80.37,
  },
] as const;

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

export interface DemoSeedSchedule {
  now: Date;
  horizonStart: Date;
  horizonEnd: Date;
  availableWindow: TimeWindow;
  busyBlocks: Array<{ startsAt: Date; endsAt: Date }>;
  lastHangoutAt: Date;
}

/**
 * Builds the one shared opening used by the demo matcher.
 *
 * Busy blocks stop at 18:15 and resume at 21:00. The matcher's 15-minute
 * padding therefore leaves 18:30–20:45 free, which becomes a two-hour dinner.
 */
export function buildDemoSeedSchedule(nowInput: Date): DemoSeedSchedule {
  const now = new Date(nowInput);
  if (!Number.isFinite(now.getTime())) throw new Error("Seed time must be a valid instant");

  const minimumStart = now.getTime() + DAY_MS;
  const localNow = getLocalParts(now, DEMO_TIMEZONE);
  let windowStart: Date | null = null;
  let windowEnd: Date | null = null;

  for (let offset = 0; offset <= 8; offset += 1) {
    const calendarDate = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day + offset, 12));
    const year = calendarDate.getUTCFullYear();
    const month = calendarDate.getUTCMonth() + 1;
    const day = calendarDate.getUTCDate();
    const candidateStart = localToUtc(year, month, day, 18, 15, DEMO_TIMEZONE);
    if (getLocalParts(candidateStart, DEMO_TIMEZONE).weekday === "Thu" && candidateStart.getTime() >= minimumStart) {
      windowStart = candidateStart;
      windowEnd = localToUtc(year, month, day, 21, 0, DEMO_TIMEZONE);
      break;
    }
  }

  if (!windowStart || !windowEnd) throw new Error("Could not find the demo Thursday");

  const horizonStart = new Date(now.getTime() + 2 * HOUR_MS);
  const horizonEnd = new Date(now.getTime() + 7 * DAY_MS);
  if (windowStart <= horizonStart || windowEnd >= horizonEnd) {
    throw new Error("The first Thursday at least 24 hours away is outside the seven-day match horizon");
  }

  const availableWindow: TimeWindow = {
    start: windowStart,
    end: windowEnd,
    starts_at: windowStart,
    ends_at: windowEnd,
  };

  return {
    now,
    horizonStart,
    horizonEnd,
    availableWindow,
    busyBlocks: [
      { startsAt: horizonStart, endsAt: windowStart },
      { startsAt: windowEnd, endsAt: horizonEnd },
    ],
    lastHangoutAt: new Date(now.getTime() - 10 * DAY_MS),
  };
}
