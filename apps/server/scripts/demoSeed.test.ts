import { describe, expect, it } from "vitest";
import { classifySlot, formatSlot, freeWindows, getLocalParts } from "../src/modules/matching/timeMath";
import { buildDemoSeedSchedule, DEMO_TIMEZONE, DEMO_USERS } from "./demoSeed";

describe("demo seed schedule", () => {
  it("uses the FIU demo identities and geography", () => {
    expect(DEMO_USERS).toEqual([
      { username: "riley", email: "riley@web.demo", homeLat: 25.781, homeLng: -80.36 },
      { username: "ojas", email: "ojas@web.demo", homeLat: 25.7, homeLng: -80.37 },
    ]);
  });

  it("chooses the first Thursday at least 24 hours away", () => {
    const now = new Date("2026-09-26T12:00:00Z");
    const schedule = buildDemoSeedSchedule(now);
    const localStart = getLocalParts(schedule.availableWindow.start, DEMO_TIMEZONE);

    expect(localStart).toMatchObject({ year: 2026, month: 10, day: 1, hour: 18, minute: 15, weekday: "Thu" });
    expect(schedule.availableWindow.start.getTime() - now.getTime()).toBeGreaterThanOrEqual(24 * 60 * 60 * 1_000);
    expect(schedule.lastHangoutAt).toEqual(new Date("2026-09-16T12:00:00Z"));
  });

  it("covers the horizon except for the intended window", () => {
    const schedule = buildDemoSeedSchedule(new Date("2026-09-26T12:00:00Z"));
    expect(schedule.busyBlocks).toEqual([
      { startsAt: schedule.horizonStart, endsAt: schedule.availableWindow.start },
      { startsAt: schedule.availableWindow.end, endsAt: schedule.horizonEnd },
    ]);
  });

  it("produces only dinner 18:30–20:30 after busy padding", () => {
    const schedule = buildDemoSeedSchedule(new Date("2026-09-26T12:00:00Z"));
    const member = {
      timezone: DEMO_TIMEZONE,
      busyBlocks: schedule.busyBlocks.map((block) => ({ start: block.startsAt, end: block.endsAt })),
    };
    const windows = freeWindows([member, member], schedule.now, { timezone: DEMO_TIMEZONE });

    expect(windows).toHaveLength(1);
    expect(getLocalParts(windows[0]!.start, DEMO_TIMEZONE)).toMatchObject({ hour: 18, minute: 30 });
    expect(getLocalParts(windows[0]!.end, DEMO_TIMEZONE)).toMatchObject({ hour: 20, minute: 45 });
    expect(formatSlot(classifySlot(windows[0]!, DEMO_TIMEZONE), DEMO_TIMEZONE)).toBe("dinner 18:30–20:30");
  });

  it("keeps local Thursday times correct across daylight-saving offsets", () => {
    const summer = buildDemoSeedSchedule(new Date("2026-06-01T12:00:00Z"));
    const winter = buildDemoSeedSchedule(new Date("2026-12-01T12:00:00Z"));
    for (const schedule of [summer, winter]) {
      expect(getLocalParts(schedule.availableWindow.start, DEMO_TIMEZONE)).toMatchObject({ weekday: "Thu", hour: 18, minute: 15 });
      expect(getLocalParts(schedule.availableWindow.end, DEMO_TIMEZONE)).toMatchObject({ weekday: "Thu", hour: 21, minute: 0 });
    }
  });

  it("fails clearly when the selected Thursday cannot fit the seven-day horizon", () => {
    expect(() => buildDemoSeedSchedule(new Date("2026-09-30T23:30:00-04:00"))).toThrow(
      "outside the seven-day match horizon",
    );
  });
});
