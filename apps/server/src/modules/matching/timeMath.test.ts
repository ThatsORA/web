import { describe, expect, it } from "vitest";
import {
  classifySlot,
  earliestTimezone,
  formatTimeHHMM,
  freeWindows,
  getLocalParts,
  localToUtc,
  mergeIntervals,
  subtractIntervals,
  type ClassifiedSlot,
} from "./timeMath";

const TZ = "America/New_York";

function formatSlot(slot: ClassifiedSlot | null, timezone = TZ): string {
  if (!slot) return "discarded";
  return `${slot.vibe_tag} ${formatTimeHHMM(slot.start, timezone)}–${formatTimeHHMM(slot.end, timezone)}`;
}

describe("classifySlot — plan §4 required unit tests verbatim", () => {
  // Base reference week: September 29, 2026 to October 4, 2026
  // Sep 29 is Tue, Sep 30 is Wed, Oct 1 is Thu, Oct 2 is Fri, Oct 3 is Sat, Oct 4 is Sun

  it("Tue 18:00–19:15 (75 min)", () => {
    const start = localToUtc(2026, 9, 29, 18, 0, TZ);
    const end = localToUtc(2026, 9, 29, 19, 15, TZ);
    const slot = classifySlot({ start, end }, TZ);

    expect(slot).not.toBeNull();
    expect(slot?.vibe_tag).toBe("casual_hangout");
    expect(formatSlot(slot, TZ)).toBe("casual_hangout 18:00–19:15");
  });

  it("Sat 13:00–16:00", () => {
    const start = localToUtc(2026, 10, 3, 13, 0, TZ);
    const end = localToUtc(2026, 10, 3, 16, 0, TZ);
    const slot = classifySlot({ start, end }, TZ);

    expect(slot).not.toBeNull();
    expect(slot?.vibe_tag).toBe("casual_hangout");
    expect(formatSlot(slot, TZ)).toBe("casual_hangout 13:00–15:00");
  });

  it("Sat 12:00–18:00 (6 h)", () => {
    const start = localToUtc(2026, 10, 3, 12, 0, TZ);
    const end = localToUtc(2026, 10, 3, 18, 0, TZ);
    const slot = classifySlot({ start, end }, TZ);

    expect(slot).not.toBeNull();
    expect(slot?.vibe_tag).toBe("casual_hangout");
    expect(formatSlot(slot, TZ)).toBe("casual_hangout 12:00–14:00");
  });

  it("Tue 19:00–22:00", () => {
    const start = localToUtc(2026, 9, 29, 19, 0, TZ);
    const end = localToUtc(2026, 9, 29, 22, 0, TZ);
    const slot = classifySlot({ start, end }, TZ);

    expect(slot).not.toBeNull();
    expect(slot?.vibe_tag).toBe("dinner");
    expect(formatSlot(slot, TZ)).toBe("dinner 19:00–21:00");
  });

  it("Wed 20:30–23:00", () => {
    const start = localToUtc(2026, 9, 30, 20, 30, TZ);
    const end = localToUtc(2026, 9, 30, 23, 0, TZ);
    const slot = classifySlot({ start, end }, TZ);

    expect(slot).not.toBeNull();
    expect(slot?.vibe_tag).toBe("night_out");
    expect(formatSlot(slot, TZ)).toBe("night_out 20:30–23:00");
  });

  it("Fri 19:00–23:00", () => {
    const start = localToUtc(2026, 10, 2, 19, 0, TZ);
    const end = localToUtc(2026, 10, 2, 23, 0, TZ);
    const slot = classifySlot({ start, end }, TZ);

    expect(slot).not.toBeNull();
    expect(slot?.vibe_tag).toBe("night_out");
    expect(formatSlot(slot, TZ)).toBe("night_out 19:00–22:00");
  });

  it("Thu 14:00–14:45", () => {
    const start = localToUtc(2026, 10, 1, 14, 0, TZ);
    const end = localToUtc(2026, 10, 1, 14, 45, TZ);
    const slot = classifySlot({ start, end }, TZ);

    expect(slot).not.toBeNull();
    expect(slot?.vibe_tag).toBe("quick_coffee");
    expect(formatSlot(slot, TZ)).toBe("quick_coffee 14:00–14:45");
  });

  it("Thu 14:00–14:40 (40 min)", () => {
    const start = localToUtc(2026, 10, 1, 14, 0, TZ);
    const end = localToUtc(2026, 10, 1, 14, 40, TZ);
    const slot = classifySlot({ start, end }, TZ);

    expect(slot).toBeNull();
    expect(formatSlot(slot, TZ)).toBe("discarded");
  });

  it("Tue 22:10–23:59", () => {
    const start = localToUtc(2026, 9, 29, 22, 10, TZ);
    const end = localToUtc(2026, 9, 29, 23, 59, TZ);
    const slot = classifySlot({ start, end }, TZ);

    expect(slot).toBeNull();
    expect(formatSlot(slot, TZ)).toBe("discarded");
  });

  it("Tue 17:10–19:00", () => {
    const start = localToUtc(2026, 9, 29, 17, 10, TZ);
    const end = localToUtc(2026, 9, 29, 19, 0, TZ);
    const slot = classifySlot({ start, end }, TZ);

    expect(slot).not.toBeNull();
    expect(slot?.vibe_tag).toBe("dinner");
    expect(formatSlot(slot, TZ)).toBe("dinner 17:30–19:00");
  });

  // 11th test from §4 rules (Sunday priority: dinner > night_out > casual_hangout > quick_coffee)
  it("Sun 18:00–21:00 (Sun–Thu priority selects dinner)", () => {
    const start = localToUtc(2026, 10, 4, 18, 0, TZ);
    const end = localToUtc(2026, 10, 4, 21, 0, TZ);
    const slot = classifySlot({ start, end }, TZ);

    expect(slot).not.toBeNull();
    expect(slot?.vibe_tag).toBe("dinner");
    expect(formatSlot(slot, TZ)).toBe("dinner 18:00–20:00");
  });

  // DST-safe test on Nov 1, 2026 (clocks fall back 2:00 EDT -> 1:00 EST)
  it("DST-safe test: window on the Nov 1 2026 fall-back weekend", () => {
    // Sunday Nov 1, 2026 evening window: 18:00 to 21:00 local time
    const start = localToUtc(2026, 11, 1, 18, 0, TZ);
    const end = localToUtc(2026, 11, 1, 21, 0, TZ);

    // In America/New_York on Nov 1, 2026, EST is UTC-5 (fall-back happened at 2am)
    // 18:00 EST = 23:00 UTC
    // 21:00 EST = 02:00 UTC on Nov 2
    expect(start.toISOString()).toBe("2026-11-01T23:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-02T02:00:00.000Z");

    const slot = classifySlot({ start, end }, TZ);
    expect(slot).not.toBeNull();
    expect(slot?.vibe_tag).toBe("dinner");
    expect(formatSlot(slot, TZ)).toBe("dinner 18:00–20:00");
    expect(slot?.start.toISOString()).toBe("2026-11-01T23:00:00.000Z");
    expect(slot?.end.toISOString()).toBe("2026-11-02T01:00:00.000Z"); // 20:00 EST
  });

  it("handles string input", () => {
    const slot = classifySlot(
      {
        start: "2026-09-29T18:00:00-04:00",
        end: "2026-09-29T19:15:00-04:00",
      },
      TZ
    );
    expect(slot?.vibe_tag).toBe("casual_hangout");
  });
});

describe("freeWindows — plan §3", () => {
  it("uses the weekday in the timezone with the earliest local wall clock", () => {
    const timezones = ["Pacific/Kiritimati", "Pacific/Honolulu"];
    const start = new Date("2026-10-02T05:00:00Z");
    const slot = classifySlot({ start, end: new Date("2026-10-02T08:00:00Z") }, timezones);

    expect(earliestTimezone(start, timezones)).toBe("Pacific/Honolulu");
    expect(slot?.vibe_tag).toBe("dinner");
  });

  it("finds a dinner valid in both New York and Chicago local time", () => {
    const timezones = ["America/New_York", "America/Chicago"];
    const windows = freeWindows(
      timezones.map((timezone, index) => ({ id: `user${index}`, timezone, busyBlocks: [] })),
      new Date("2026-09-29T19:00:00Z"),
      { busyPaddingMin: 0, minLeadHours: 2, horizonDays: 1 },
    );
    const dinner = windows.map(window => classifySlot(window, timezones)).find(slot => slot?.vibe_tag === "dinner");

    expect(dinner?.start).toEqual(new Date("2026-09-29T22:30:00Z"));
    expect(formatSlot(dinner ?? null, "America/New_York")).toBe("dinner 18:30–20:30");
    expect(formatSlot(dinner ?? null, "America/Chicago")).toBe("dinner 17:30–19:30");
  });

  it("discards a New York and Los Angeles late window with no shared valid template", () => {
    const timezones = ["America/New_York", "America/Los_Angeles"];
    const blocked = { start: new Date("2026-09-29T21:00:00Z"), end: new Date("2026-09-30T01:00:00Z") };
    const windows = freeWindows(
      timezones.map((timezone, index) => ({ id: `user${index}`, timezone, busyBlocks: [blocked] })),
      new Date("2026-09-29T19:00:00Z"),
      { busyPaddingMin: 0, minLeadHours: 2, horizonDays: 1 },
    );

    expect(windows[0]).toEqual({ start: new Date("2026-09-30T01:00:00Z"), end: new Date("2026-09-30T04:00:00Z") });
    expect(classifySlot(windows[0]!, timezones)).toBeNull();
    expect(earliestTimezone(windows[0]!.start, timezones)).toBe("America/Los_Angeles");
  });

  it("pads busy blocks by BUSY_PADDING_MIN on each side", () => {
    // Tuesday 10:00 local
    const now = localToUtc(2026, 9, 29, 10, 0, TZ);
    // Lead time is 2h -> horizon starts at 12:00
    // Member has a busy block 13:00–14:00
    // With 15-min padding: 12:45–14:15 is busy
    const members = [
      {
        id: "user1",
        timezone: TZ,
        busyBlocks: [
          {
            start: localToUtc(2026, 9, 29, 13, 0, TZ),
            end: localToUtc(2026, 9, 29, 14, 0, TZ),
          },
        ],
      },
    ];

    const windows = freeWindows(members, now, { timezone: TZ, horizonDays: 1 });
    // First day waking hours [12:00, 24:00] minus [12:45, 14:15]
    // -> [12:00, 12:45] and [14:15, 24:00]
    const day1Windows = windows.filter(
      (w) => w.start.getTime() < localToUtc(2026, 9, 30, 0, 0, TZ).getTime()
    );

    expect(day1Windows).toHaveLength(2);
    expect(formatTimeHHMM(day1Windows[0]!.start, TZ)).toBe("12:00");
    expect(formatTimeHHMM(day1Windows[0]!.end, TZ)).toBe("12:45");
    expect(formatTimeHHMM(day1Windows[1]!.start, TZ)).toBe("14:15");
    expect(formatTimeHHMM(day1Windows[1]!.end, TZ)).toBe("00:00");
  });

  it("adds open-event slots unpadded to prevent double-booking", () => {
    const now = localToUtc(2026, 9, 29, 10, 0, TZ);
    const members = [
      {
        id: "user1",
        timezone: TZ,
        busyBlocks: [],
        openEvents: [
          {
            start: localToUtc(2026, 9, 29, 18, 0, TZ),
            end: localToUtc(2026, 9, 29, 20, 0, TZ),
          },
        ],
      },
    ];

    const windows = freeWindows(members, now, { timezone: TZ, horizonDays: 1 });
    const day1Windows = windows.filter(
      (w) => w.start.getTime() < localToUtc(2026, 9, 30, 0, 0, TZ).getTime()
    );

    // Waking hours [12:00, 24:00] minus unpadded open event [18:00, 20:00]
    expect(day1Windows).toHaveLength(2);
    expect(formatTimeHHMM(day1Windows[0]!.start, TZ)).toBe("12:00");
    expect(formatTimeHHMM(day1Windows[0]!.end, TZ)).toBe("18:00");
    expect(formatTimeHHMM(day1Windows[1]!.start, TZ)).toBe("20:00");
    expect(formatTimeHHMM(day1Windows[1]!.end, TZ)).toBe("00:00");
  });

  it("enforces waking hours 08:00–24:00 local time (excludes 00:00–08:00)", () => {
    const now = localToUtc(2026, 9, 29, 10, 0, TZ);
    const members = [{ id: "user1", timezone: TZ, busyBlocks: [] }];

    const windows = freeWindows(members, now, { timezone: TZ, horizonDays: 2 });
    // Day 2 should start exactly at 08:00 and end at 24:00 (00:00 next day)
    const day2Start = localToUtc(2026, 9, 30, 0, 0, TZ);
    const day2End = localToUtc(2026, 10, 1, 0, 0, TZ);
    const day2Windows = windows.filter(
      (w) => w.start.getTime() >= day2Start.getTime() && w.end.getTime() <= day2End.getTime()
    );

    expect(day2Windows).toHaveLength(1);
    expect(formatTimeHHMM(day2Windows[0]!.start, TZ)).toBe("08:00");
    expect(formatTimeHHMM(day2Windows[0]!.end, TZ)).toBe("00:00");
  });

  it("enforces range [now + 2h, now + 7d]", () => {
    const now = localToUtc(2026, 9, 29, 6, 0, TZ); // 06:00 local
    const members = [{ id: "user1", timezone: TZ, busyBlocks: [] }];

    // now + 2h is 08:00 local, exactly waking hours start
    const windows = freeWindows(members, now, { timezone: TZ, minLeadHours: 2, horizonDays: 7 });

    const firstWindow = windows[0]!;
    expect(firstWindow).toBeDefined();
    expect(firstWindow.start.getTime()).toBe(localToUtc(2026, 9, 29, 8, 0, TZ).getTime());

    const lastWindow = windows[windows.length - 1]!;
    expect(lastWindow).toBeDefined();
    const rangeEnd = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    expect(lastWindow.end.getTime()).toBeLessThanOrEqual(rangeEnd.getTime());
  });

  it("intersects free windows across multiple members", () => {
    const now = localToUtc(2026, 9, 29, 10, 0, TZ);

    // Member 1 busy 14:00–16:00 (padded: 13:45–16:15)
    // Member 2 busy 17:00–19:00 (padded: 16:45–19:15)
    const members = [
      {
        id: "user1",
        timezone: TZ,
        busyBlocks: [
          {
            start: localToUtc(2026, 9, 29, 14, 0, TZ),
            end: localToUtc(2026, 9, 29, 16, 0, TZ),
          },
        ],
      },
      {
        id: "user2",
        timezone: TZ,
        busyBlocks: [
          {
            start: localToUtc(2026, 9, 29, 17, 0, TZ),
            end: localToUtc(2026, 9, 29, 19, 0, TZ),
          },
        ],
      },
    ];

    const windows = freeWindows(members, now, { timezone: TZ, horizonDays: 1 });
    const day1Windows = windows.filter(
      (w) => w.start.getTime() < localToUtc(2026, 9, 30, 0, 0, TZ).getTime()
    );

    // Day 1 waking hours [12:00, 24:00]
    // Blocked: [13:45, 16:15] and [16:45, 19:15]
    // Free: [12:00, 13:45], [16:15, 16:45], [19:15, 24:00]
    expect(day1Windows).toHaveLength(3);
    expect(formatTimeHHMM(day1Windows[0]!.start, TZ)).toBe("12:00");
    expect(formatTimeHHMM(day1Windows[0]!.end, TZ)).toBe("13:45");
    expect(formatTimeHHMM(day1Windows[1]!.start, TZ)).toBe("16:15");
    expect(formatTimeHHMM(day1Windows[1]!.end, TZ)).toBe("16:45");
    expect(formatTimeHHMM(day1Windows[2]!.start, TZ)).toBe("19:15");
    expect(formatTimeHHMM(day1Windows[2]!.end, TZ)).toBe("00:00");
  });

  it("handles DST fall-back transition seamlessly across Nov 1 2026", () => {
    // Start on Friday Oct 30, 2026, 12:00 local time
    const now = localToUtc(2026, 10, 30, 12, 0, TZ);
    const members = [{ id: "user1", timezone: TZ, busyBlocks: [] }];

    const windows = freeWindows(members, now, { timezone: TZ, horizonDays: 4 });
    // Find window on Sunday Nov 1, 2026 (the DST fall-back day)
    const nov1Start = localToUtc(2026, 11, 1, 0, 0, TZ);
    const nov1End = localToUtc(2026, 11, 2, 0, 0, TZ);

    const nov1Windows = windows.filter(
      (w) => w.start.getTime() >= nov1Start.getTime() && w.end.getTime() <= nov1End.getTime()
    );

    expect(nov1Windows).toHaveLength(1);
    const dayWindow = nov1Windows[0]!;
    expect(formatTimeHHMM(dayWindow.start, TZ)).toBe("08:00");
    expect(formatTimeHHMM(dayWindow.end, TZ)).toBe("00:00");

    // Waking hours is 16 hours duration despite the 25h day
    const durationHours = (dayWindow.end.getTime() - dayWindow.start.getTime()) / 3600000;
    expect(durationHours).toBe(16);
  });

  it("returns empty array for empty members list", () => {
    expect(freeWindows([], new Date(), { timezone: TZ })).toEqual([]);
  });
});

describe("helper functions", () => {
  it("deduplicates identical or overlapping intervals from different sources", () => {
    const t0 = new Date("2026-09-29T10:00:00Z");
    const t1 = new Date("2026-09-29T11:00:00Z");
    const t2 = new Date("2026-09-29T10:30:00Z");
    const t3 = new Date("2026-09-29T11:30:00Z");

    const merged = mergeIntervals([
      { start: t0, end: t1 }, // device_calendar block
      { start: t2, end: t3 }, // google_calendar block overlapping
      { start: t0, end: t1 }, // exact duplicate
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]!.start).toEqual(t0);
    expect(merged[0]!.end).toEqual(t3);
  });

  it("mergeIntervals combines overlapping and abutting intervals", () => {
    const t0 = new Date("2026-09-29T10:00:00Z");
    const t1 = new Date("2026-09-29T11:00:00Z");
    const t2 = new Date("2026-09-29T11:30:00Z");
    const t3 = new Date("2026-09-29T12:00:00Z");
    const t4 = new Date("2026-09-29T13:00:00Z");

    const merged = mergeIntervals([
      { start: t0, end: t1 },
      { start: t1, end: t2 }, // abutting
      { start: t3, end: t4 }, // disjoint
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0]!.start).toEqual(t0);
    expect(merged[0]!.end).toEqual(t2);
    expect(merged[1]!.start).toEqual(t3);
    expect(merged[1]!.end).toEqual(t4);
  });

  it("subtractIntervals correctly cuts busy chunks out of source window", () => {
    const wStart = new Date("2026-09-29T10:00:00Z");
    const wEnd = new Date("2026-09-29T14:00:00Z");
    const bStart = new Date("2026-09-29T11:00:00Z");
    const bEnd = new Date("2026-09-29T12:00:00Z");

    const free = subtractIntervals([{ start: wStart, end: wEnd }], [{ start: bStart, end: bEnd }]);

    expect(free).toHaveLength(2);
    expect(free[0]!.start).toEqual(wStart);
    expect(free[0]!.end).toEqual(bStart);
    expect(free[1]!.start).toEqual(bEnd);
    expect(free[1]!.end).toEqual(wEnd);
  });

  it("getLocalParts parses accurate components", () => {
    const d = new Date("2026-09-29T18:00:00-04:00");
    const parts = getLocalParts(d, "America/New_York");
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(9);
    expect(parts.day).toBe(29);
    expect(parts.hour).toBe(18);
    expect(parts.minute).toBe(0);
    expect(parts.weekday).toBe("Tue");
  });
});
