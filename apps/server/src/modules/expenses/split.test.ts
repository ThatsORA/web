import { describe, expect, it } from "vitest";
import { customSplitError, splitEqually } from "./split";

const amounts = (total: number, n: number) => splitEqually(total, ["a", "b", "c", "d"].slice(0, n)).map((s) => s.amountCents);

describe("splitEqually", () => {
  it("gives leftover cents to the first participants", () => {
    expect(amounts(1000, 3)).toEqual([334, 333, 333]);
    expect(amounts(1001, 4)).toEqual([251, 250, 250, 250]);
  });
  it("splits evenly with no leftover and always sums to the total", () => {
    expect(amounts(1200, 4)).toEqual([300, 300, 300, 300]);
    expect(amounts(1, 3)).toEqual([1, 0, 0]);
    expect(amounts(999, 2).reduce((a, b) => a + b)).toBe(999);
  });
  it("keeps user order", () => {
    expect(splitEqually(5, ["x", "y"])).toEqual([{ userId: "x", amountCents: 3 }, { userId: "y", amountCents: 2 }]);
  });
});

describe("customSplitError", () => {
  const attendees = ["a", "b", "c"];
  const split = (...pairs: [string, number][]) => pairs.map(([user_id, amount_cents]) => ({ user_id, amount_cents }));
  it("accepts distinct attendees summing exactly to the total, even a subset", () => {
    expect(customSplitError(1000, split(["a", 600], ["c", 400]), attendees)).toBeNull();
  });
  it("rejects a sum off by even one cent", () => {
    expect(customSplitError(1000, split(["a", 600], ["b", 399]), attendees)).toBe("sum_mismatch");
    expect(customSplitError(1000, split(["a", 1001]), attendees)).toBe("sum_mismatch");
  });
  it("rejects users who aren't confirmed attendees, and duplicates", () => {
    expect(customSplitError(1000, split(["a", 500], ["z", 500]), attendees)).toBe("not_attendee");
    expect(customSplitError(1000, split(["a", 500], ["a", 500]), attendees)).toBe("duplicate_user");
  });
});
