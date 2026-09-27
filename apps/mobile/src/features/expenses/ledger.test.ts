import { describe, expect, it } from "vitest";
import type { Expense } from "@web/contract";
import {
  attendeeName,
  calculateWhoOwesWhom,
  canToggleSplit,
  formatDebtLine,
  type AttendeeInfo,
} from "./ledger";

const attendees: AttendeeInfo[] = [
  { id: "u-riley", username: "rileyh6", display_name: "Riley" },
  { id: "u-andy", username: "andydo4", display_name: "Andy" },
  { id: "u-ojas", username: "TheRealOP", display_name: "Ojas" },
];

describe("calculateWhoOwesWhom", () => {
  it("returns empty array when there are no expenses", () => {
    expect(calculateWhoOwesWhom([])).toEqual([]);
  });

  it("calculates pairwise debt from an equal split expense", () => {
    // Andy paid $30.00 for Riley, Andy, and Ojas ($10.00 each)
    const expense: Expense = {
      id: "exp-1",
      paid_by: "u-andy",
      total_cents: 3000,
      description: "Dinner",
      created_at: "2026-09-26T20:00:00.000Z",
      splits: [
        { id: "s-1", user_id: "u-andy", amount_owed_cents: 1000, settled: true },
        { id: "s-2", user_id: "u-riley", amount_owed_cents: 1000, settled: false },
        { id: "s-3", user_id: "u-ojas", amount_owed_cents: 1000, settled: false },
      ],
    };

    const debts = calculateWhoOwesWhom([expense]);
    expect(debts).toEqual([
      { fromUserId: "u-ojas", toUserId: "u-andy", amountCents: 1000 },
      { fromUserId: "u-riley", toUserId: "u-andy", amountCents: 1000 },
    ]);
  });

  it("ignores already settled splits", () => {
    const expense: Expense = {
      id: "exp-1",
      paid_by: "u-andy",
      total_cents: 2000,
      description: "Drinks",
      created_at: "2026-09-26T20:00:00.000Z",
      splits: [
        { id: "s-1", user_id: "u-andy", amount_owed_cents: 1000, settled: true },
        { id: "s-2", user_id: "u-riley", amount_owed_cents: 1000, settled: true }, // Riley settled
      ],
    };

    expect(calculateWhoOwesWhom([expense])).toEqual([]);
  });

  it("nets debts when participants pay each other across multiple expenses", () => {
    // Expense 1: Andy paid $30, Riley owes $15
    const exp1: Expense = {
      id: "exp-1",
      paid_by: "u-andy",
      total_cents: 3000,
      description: "Lunch",
      created_at: "2026-09-26T20:00:00.000Z",
      splits: [
        { id: "s-1", user_id: "u-andy", amount_owed_cents: 1500, settled: true },
        { id: "s-2", user_id: "u-riley", amount_owed_cents: 1500, settled: false },
      ],
    };

    // Expense 2: Riley paid $10, Andy owes $5
    const exp2: Expense = {
      id: "exp-2",
      paid_by: "u-riley",
      total_cents: 1000,
      description: "Coffee",
      created_at: "2026-09-26T21:00:00.000Z",
      splits: [
        { id: "s-3", user_id: "u-riley", amount_owed_cents: 500, settled: true },
        { id: "s-4", user_id: "u-andy", amount_owed_cents: 500, settled: false },
      ],
    };

    // Riley owes Andy $15, Andy owes Riley $5 -> Net: Riley owes Andy $10
    const debts = calculateWhoOwesWhom([exp1, exp2]);
    expect(debts).toEqual([
      { fromUserId: "u-riley", toUserId: "u-andy", amountCents: 1000 },
    ]);
  });

  it("resolves to empty when mutual debts exactly balance out", () => {
    const exp1: Expense = {
      id: "exp-1",
      paid_by: "u-andy",
      total_cents: 1000,
      description: "Snack 1",
      created_at: "2026-09-26T20:00:00.000Z",
      splits: [
        { id: "s-1", user_id: "u-andy", amount_owed_cents: 500, settled: true },
        { id: "s-2", user_id: "u-riley", amount_owed_cents: 500, settled: false },
      ],
    };

    const exp2: Expense = {
      id: "exp-2",
      paid_by: "u-riley",
      total_cents: 1000,
      description: "Snack 2",
      created_at: "2026-09-26T21:00:00.000Z",
      splits: [
        { id: "s-3", user_id: "u-riley", amount_owed_cents: 500, settled: true },
        { id: "s-4", user_id: "u-andy", amount_owed_cents: 500, settled: false },
      ],
    };

    expect(calculateWhoOwesWhom([exp1, exp2])).toEqual([]);
  });
});

describe("attendeeName and formatDebtLine", () => {
  it("formats attendee names properly", () => {
    expect(attendeeName("u-riley", attendees, "u-riley")).toBe("Riley (You)");
    expect(attendeeName("u-riley", attendees, "u-riley", { preferYou: true })).toBe("You");
    expect(attendeeName("u-andy", attendees, "u-riley")).toBe("Andy");
    expect(attendeeName("u-unknown", attendees, "u-riley")).toBe("Unknown");
  });

  it("formats debt lines from perspective of current user", () => {
    const debt = { fromUserId: "u-riley", toUserId: "u-andy", amountCents: 1250 };
    expect(formatDebtLine(debt, attendees, "u-riley")).toBe("You owe Andy $12.50");
    expect(formatDebtLine(debt, attendees, "u-andy")).toBe("Riley owes you $12.50");
    expect(formatDebtLine(debt, attendees, "u-ojas")).toBe("Riley owes Andy $12.50");
  });
});

describe("canToggleSplit", () => {
  const expense: Expense = {
    id: "exp-1",
    paid_by: "u-andy",
    total_cents: 2000,
    description: "Dessert",
    created_at: "2026-09-26T20:00:00.000Z",
    splits: [
      { id: "s-1", user_id: "u-andy", amount_owed_cents: 1000, settled: true },
      { id: "s-2", user_id: "u-riley", amount_owed_cents: 1000, settled: false },
    ],
  };

  it("disallows toggling the payer's own split", () => {
    expect(canToggleSplit(expense.splits[0]!, expense, "u-andy")).toBe(false);
  });

  it("allows the payer to toggle a split", () => {
    expect(canToggleSplit(expense.splits[1]!, expense, "u-andy")).toBe(true);
  });

  it("allows the debtor to toggle their own split", () => {
    expect(canToggleSplit(expense.splits[1]!, expense, "u-riley")).toBe(true);
  });

  it("disallows unrelated third parties from toggling", () => {
    expect(canToggleSplit(expense.splits[1]!, expense, "u-ojas")).toBe(false);
  });

  it("disallows unauthenticated viewers", () => {
    expect(canToggleSplit(expense.splits[1]!, expense, null)).toBe(false);
  });
});
