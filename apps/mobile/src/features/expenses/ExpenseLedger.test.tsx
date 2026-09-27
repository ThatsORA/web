import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Expense } from "@web/contract";
import { Badge, Button, Callout, Txt } from "../../ui";
import { ExpenseLedger, ExpenseLedgerView } from "./ExpenseLedger";

vi.mock("react-native", () => ({
  View: "View",
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
}));

vi.mock("../../ui", () => ({
  Badge: (props: any) => ({ type: "Badge", props }),
  Button: (props: any) => ({ type: "Button", props }),
  Callout: (props: any) => ({ type: "Callout", props }),
  Txt: (props: any) => ({ type: "Txt", props }),
  useTheme: () => ({
    colors: { primary: "#6A00F4", surfaceMuted: "#eee", border: "#ccc" },
    spacing: { xs: 4, sm: 8, md: 16 },
    radius: { sm: 1 },
  }),
}));

function elements(node: ReactNode): ReactElement[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement(child) ? [child, ...elements((child.props as { children?: ReactNode }).children)] : []
  );
}

const attendees = [
  { id: "u-andy", username: "andydo4", display_name: "Andy" },
  { id: "u-riley", username: "rileyh6", display_name: "Riley" },
  { id: "u-ojas", username: "TheRealOP", display_name: "Ojas" },
];

describe("ExpenseLedger", () => {
  it("exports ExpenseLedger and ExpenseLedgerView functions", () => {
    expect(typeof ExpenseLedger).toBe("function");
    expect(typeof ExpenseLedgerView).toBe("function");
  });

  it("renders empty state when there are no expenses", () => {
    const onAdd = vi.fn();
    const rendered = elements(
      ExpenseLedgerView({
        expenses: [],
        attendees,
        currentUserId: "u-riley",
        onAddExpense: onAdd,
      })
    );

    const texts = rendered
      .filter((el) => el.type === Txt)
      .map((el) => Children.toArray((el.props as { children: ReactNode }).children).join(""));
    expect(texts).toContain("No expenses recorded yet.");

    const buttons = rendered
      .filter((el) => el.type === Button)
      .map((el) => el.props as { label: string; onPress: () => void });
    expect(buttons.map((b) => b.label)).toContain("Add expense");

    buttons[0]!.onPress();
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("renders expenses, equal splits, who owes whom, and settled toggle", () => {
    const onToggle = vi.fn();
    const expense: Expense = {
      id: "exp-1",
      paid_by: "u-andy",
      total_cents: 3000,
      description: "Tacos",
      created_at: "2026-09-26T20:00:00.000Z",
      splits: [
        { id: "s-1", user_id: "u-andy", amount_owed_cents: 1000, settled: true },
        { id: "s-2", user_id: "u-riley", amount_owed_cents: 1000, settled: false },
        { id: "s-3", user_id: "u-ojas", amount_owed_cents: 1000, settled: false },
      ],
    };

    const rendered = elements(
      ExpenseLedgerView({
        expenses: [expense],
        attendees,
        currentUserId: "u-riley",
        onToggleSplit: onToggle,
      })
    );

    const texts = rendered
      .filter((el) => el.type === Txt)
      .map((el) => Children.toArray((el.props as { children: ReactNode }).children).join(""));

    // Descriptions & total
    expect(texts).toContain("Tacos");
    expect(texts).toContain("$30.00");
    expect(texts).toContain("Paid by Andy");

    // Who owes whom breakdown from Riley's perspective
    expect(texts).toContain("You owe Andy $10.00");
    expect(texts).toContain("Ojas owes Andy $10.00");

    // Badges
    const badges = rendered
      .filter((el) => el.type === Badge)
      .map((el) => el.props as { label: string; tone?: string });
    expect(badges.map((b) => b.label)).toContain("Payer");
    expect(badges.map((b) => b.label)).toContain("Owes");

    // Settled toggles: Riley is debtor on s-2, so Riley can toggle s-2 ("Mark settled"),
    // but Riley cannot toggle s-3 (Ojas's split with Andy).
    const buttons = rendered
      .filter((el) => el.type === Button)
      .map((el) => el.props as { label: string; onPress: () => void });

    const toggleButton = buttons.find((b) => b.label === "Mark settled");
    expect(toggleButton).toBeDefined();
    toggleButton!.onPress();
    expect(onToggle).toHaveBeenCalledWith("s-2", true);
  });

  it("renders 'All balances settled' when all debts are settled", () => {
    const expense: Expense = {
      id: "exp-1",
      paid_by: "u-andy",
      total_cents: 2000,
      description: "Drinks",
      created_at: "2026-09-26T20:00:00.000Z",
      splits: [
        { id: "s-1", user_id: "u-andy", amount_owed_cents: 1000, settled: true },
        { id: "s-2", user_id: "u-riley", amount_owed_cents: 1000, settled: true },
      ],
    };

    const rendered = elements(
      ExpenseLedgerView({
        expenses: [expense],
        attendees,
        currentUserId: "u-riley",
      })
    );

    const texts = rendered
      .filter((el) => el.type === Txt)
      .map((el) => Children.toArray((el.props as { children: ReactNode }).children).join(""));

    expect(texts).toContain("All balances settled");
  });

  it("renders error callout when error is set", () => {
    const rendered = elements(
      ExpenseLedgerView({
        expenses: [],
        attendees,
        currentUserId: "u-riley",
        error: "Failed to load",
      })
    );

    const callouts = rendered
      .filter((el) => el.type === Callout)
      .map((el) => (el.props as { children: ReactNode }).children);
    expect(callouts).toContain("Failed to load");
  });
});
