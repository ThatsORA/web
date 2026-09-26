import { describe, expect, it } from "vitest";
import { windowsByDay } from "./availability";

const windows = [
  { starts_at: "2026-09-29T13:00:00Z", ends_at: "2026-09-29T15:30:00Z" },
  { starts_at: "2026-09-29T20:00:00Z", ends_at: "2026-09-30T02:00:00Z" },
  { starts_at: "2026-09-30T13:00:00Z", ends_at: "2026-09-30T14:00:00Z" },
];
// ICU may put a narrow no-break space before AM/PM.
const plain = (groups: ReturnType<typeof windowsByDay>) => JSON.parse(JSON.stringify(groups).replace(/ /g, " "));

describe("windowsByDay", () => {
  it("groups windows by local start day, in order", () => {
    expect(plain(windowsByDay(windows, "America/New_York"))).toEqual([
      { day: "Tue, Sep 29", times: ["9:00 AM – 11:30 AM", "4:00 PM – 10:00 PM"] },
      { day: "Wed, Sep 30", times: ["9:00 AM – 10:00 AM"] },
    ]);
  });
  it("uses the given zone for day boundaries", () => {
    expect(windowsByDay(windows, "Asia/Tokyo").map(g => g.day)).toEqual(["Tue, Sep 29", "Wed, Sep 30"]);
    expect(windowsByDay(windows, "Asia/Tokyo")[1]!.times).toHaveLength(2);
  });
  it("returns nothing for no windows", () => {
    expect(windowsByDay([])).toEqual([]);
  });
});
