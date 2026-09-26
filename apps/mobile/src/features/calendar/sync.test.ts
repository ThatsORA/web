import { describe, expect, it, vi } from "vitest";
import { busyBlockPayload, createCalendarSync, type CalendarInterval } from "./sync";
const start = new Date("2026-09-26T12:00:00Z");
const end = new Date("2026-10-03T12:00:00Z");
const busy: CalendarInterval = { startDate: "2026-09-27T12:00:00Z", endDate: "2026-09-27T13:00:00Z", allDay: false, availability: "busy" };

describe("privacy and intervals", () => {
  it("reads only timing fields, skips all-day/free events and deduplicates", () => {
    const privateEvent = { ...busy,
      get title(): never { throw Error("title read"); },
      get notes(): never { throw Error("notes read"); },
      get attendees(): never { throw Error("attendees read"); },
    };
    expect(busyBlockPayload([privateEvent, busy, { ...busy, allDay: true }, { ...busy, availability: "free" }], start, end)).toEqual({
      horizon_start: start.toISOString(), horizon_end: end.toISOString(),
      blocks: [{ starts_at: "2026-09-27T12:00:00.000Z", ends_at: "2026-09-27T13:00:00.000Z" }],
    });
  });
  it("clips overlapping events and discards invalid, reversed and outside intervals", () => {
    const events = [
      { ...busy, startDate: "2026-09-25T00:00:00Z", endDate: "2026-10-04T00:00:00Z" },
      { ...busy, startDate: "invalid" },
      { ...busy, startDate: busy.endDate },
      { ...busy, startDate: "2026-09-24T00:00:00Z", endDate: start },
    ];
    expect(busyBlockPayload(events, start, end).blocks).toEqual([{ starts_at: start.toISOString(), ends_at: end.toISOString() }]);
  });
});
function setup() {
  let clock = start.getTime();
  const deps = { permission: vi.fn(async () => true), read: vi.fn(async () => [busy]), upload: vi.fn(async () => ({ stored: 1 })), now: () => clock };
  return { deps, sync: createCalendarSync(deps).sync, advance: (ms: number) => { clock += ms; } };
}
describe("calendar sync", () => {
  it("requests permission for onboarding, returns stored count and reads exactly seven days", async () => {
    const { deps, sync } = setup();
    expect(await sync(true)).toBe(1);
    expect(deps.permission).toHaveBeenCalledWith(true);
    expect(deps.read).toHaveBeenCalledWith(start, end);
  });
  it("does not upload when permission is denied, preserving seeded accounts", async () => {
    const { deps, sync } = setup();
    deps.permission.mockResolvedValue(false);
    expect(await sync(true)).toBeNull();
    expect(deps.read).not.toHaveBeenCalled();
    expect(deps.upload).not.toHaveBeenCalled();
  });
  it("resyncs only after more than 15 minutes and checks without prompting", async () => {
    const { deps, sync, advance } = setup();
    await sync();
    advance(15 * 60_000);
    expect(await sync()).toBeNull();
    advance(1);
    expect(await sync()).toBe(1);
    expect(deps.upload).toHaveBeenCalledTimes(2);
    expect(deps.permission).toHaveBeenLastCalledWith(false);
  });
  it("coalesces concurrent calls and retries failed uploads without waiting", async () => {
    const { deps, sync } = setup();
    deps.upload.mockRejectedValueOnce(Error("offline"));
    const first = sync();
    expect(sync()).toBe(first);
    await expect(first).rejects.toThrow("offline");
    expect(await sync()).toBe(1);
  });
  it("uploads an empty replacement when calendars contain no busy events", async () => {
    const { deps, sync } = setup();
    deps.read.mockResolvedValue([]);
    deps.upload.mockResolvedValue({ stored: 0 });
    expect(await sync()).toBe(0);
    expect(deps.upload.mock.calls[0]).toBeDefined();
  });
});
