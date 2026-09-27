import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Expense } from "@web/contract";
import { Badge, Button, Callout, Modal, Txt } from "../../ui";
import { ExpenseLedger, ExpenseLedgerView } from "./ExpenseLedger";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: any) => [typeof initial === "function" ? initial() : initial, vi.fn()],
  };
});

vi.mock("react-native", () => ({
  View: "View",
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  Modal: "RNModal",
}));

vi.mock("../../ui", () => ({
  Badge: (props: any) => ({ type: "Badge", props }),
  Button: (props: any) => ({ type: "Button", props }),
  Callout: (props: any) => ({ type: "Callout", props }),
  Modal: (props: any) => (props.visible ? { type: "Modal", props, children: props.children } : null),
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

  it("renders expenses and net balances with danger color and without 'Who owes whom' header", () => {
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
        initialModalOpen: true,
      })
    );

    const txtElements = rendered.filter((el) => el.type === Txt);
    const texts = txtElements.map((el) =>
      Children.toArray((el.props as { children: ReactNode }).children).join("")
    );

    // Header "Who owes whom" should NOT be present
    expect(texts).not.toContain("Who owes whom");

    // Descriptions & total in modal
    expect(texts).toContain("Tacos");
    expect(texts).toContain("$30.00");
    expect(texts).toContain("Paid by Andy");

    // Net balance breakdown from Riley's perspective
    expect(texts).toContain("You owe Andy $10.00");
    expect(texts).toContain("Ojas owes Andy $10.00");

    // Check danger color on debt line where user owes money
    const oweLine = txtElements.find(
      (el) =>
        Children.toArray((el.props as { children: ReactNode }).children).join("") ===
        "You owe Andy $10.00"
    );
    expect(oweLine?.props.color).toBe("danger");

    // Check third-party debt line has no special color
    const thirdPartyLine = txtElements.find(
      (el) =>
        Children.toArray((el.props as { children: ReactNode }).children).join("") ===
        "Ojas owes Andy $10.00"
    );
    expect(thirdPartyLine?.props.color).toBeUndefined();

    // Badges
    const badges = rendered
      .filter((el) => el.type === Badge)
      .map((el) => el.props as { label: string; tone?: string });
    expect(badges.map((b) => b.label)).toContain("Payer");
    expect(badges.map((b) => b.label)).toContain("Owes");

    // Individual split toggle button
    const buttons = rendered
      .filter((el) => el.type === Button)
      .map((el) => el.props as { label: string; onPress: () => void });

    const settleButtons = buttons.filter((b) => b.label === "Settle" || b.label === "Mark settled");
    expect(settleButtons.length).toBeGreaterThan(0);
  });

  it("colors net balance green (success) when current user is owed money", () => {
    const expense: Expense = {
      id: "exp-1",
      paid_by: "u-riley",
      total_cents: 2000,
      description: "Pizza",
      created_at: "2026-09-26T20:00:00.000Z",
      splits: [
        { id: "s-1", user_id: "u-riley", amount_owed_cents: 1000, settled: true },
        { id: "s-2", user_id: "u-andy", amount_owed_cents: 1000, settled: false },
      ],
    };

    const rendered = elements(
      ExpenseLedgerView({
        expenses: [expense],
        attendees,
        currentUserId: "u-riley",
      })
    );

    const txtElements = rendered.filter((el) => el.type === Txt);
    const texts = txtElements.map((el) =>
      Children.toArray((el.props as { children: ReactNode }).children).join("")
    );

    expect(texts).toContain("Andy owes you $10.00");

    const owedLine = txtElements.find(
      (el) =>
        Children.toArray((el.props as { children: ReactNode }).children).join("") ===
        "Andy owes you $10.00"
    );
    expect(owedLine?.props.color).toBe("success");
  });

  it("renders a settlement confirmation modal with expected text when settling net debt", () => {
    const onConfirmSettleDebt = vi.fn();
    const onCancelSettleDebt = vi.fn();
    const expense: Expense = {
      id: "exp-1",
      paid_by: "u-andy",
      total_cents: 2000,
      description: "Lunch",
      created_at: "2026-09-26T20:00:00.000Z",
      splits: [
        { id: "s-1", user_id: "u-andy", amount_owed_cents: 1000, settled: true },
        { id: "s-2", user_id: "u-riley", amount_owed_cents: 1000, settled: false },
      ],
    };

    const debtToConfirm = { fromUserId: "u-riley", toUserId: "u-andy", amountCents: 1000 };

    // When modal is open (confirmingDebt is set)
    const renderedModal = elements(
      ExpenseLedgerView({
        expenses: [expense],
        attendees,
        currentUserId: "u-riley",
        confirmingDebt: debtToConfirm,
        onConfirmSettleDebt,
        onCancelSettleDebt,
      })
    );

    const modalTexts = renderedModal
      .filter((el) => el.type === Txt)
      .map((el) => Children.toArray((el.props as { children: ReactNode }).children).join(""));

    expect(modalTexts).toContain("Mark balance settled?");
    expect(modalTexts).toContain("Are you sure you want to mark this balance as settled?");

    const modalButtons = renderedModal
      .filter((el) => el.type === Button)
      .map((el) => el.props as { label: string; onPress: () => void });

    const cancelButton = modalButtons.find((b) => b.label === "Cancel");
    expect(cancelButton).toBeDefined();
    cancelButton!.onPress();
    expect(onCancelSettleDebt).toHaveBeenCalledOnce();

    const confirmButton = modalButtons.find((b) => b.label === "Mark settled");
    expect(confirmButton).toBeDefined();
    confirmButton!.onPress();
    expect(onConfirmSettleDebt).toHaveBeenCalledWith(debtToConfirm);
  });

  it("renders 'Mark unsettled' on settled splits and allows toggling back to unsettled", () => {
    const onToggle = vi.fn();
    const expense: Expense = {
      id: "exp-1",
      paid_by: "u-andy",
      total_cents: 2000,
      description: "Coffee",
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
        onToggleSplit: onToggle,
        initialModalOpen: true,
      })
    );

    const buttons = rendered
      .filter((el) => el.type === Button)
      .map((el) => el.props as { label: string; onPress: () => void; variant?: string });

    const toggleButton = buttons.find((b) => b.label === "Mark unsettled");
    expect(toggleButton).toBeDefined();
    expect(toggleButton!.variant).toBe("ghost");
    toggleButton!.onPress();
    expect(onToggle).toHaveBeenCalledWith("s-2", false);
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


