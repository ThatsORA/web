// Owner: Ojas — expense ledger component. Displays expenses, equal split calculations,
// who owes whom breakdown, and settled toggles per split. Mounted on ConfirmedCard.
import { ExpensesResponse, type Expense, type PatchExpenseSplitRequest, routes } from "@web/contract";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { z } from "zod";
import { api } from "../../lib/api";
import { Badge, Button, Callout, Txt, useTheme } from "../../ui";
import { formatCents } from "./amounts";
import {
  attendeeName,
  calculateWhoOwesWhom,
  canToggleSplit,
  formatDebtLine,
  type AttendeeInfo,
} from "./ledger";

const VoidResponse = z.unknown();

export type ExpenseLedgerViewProps = {
  expenses: Expense[];
  attendees: AttendeeInfo[];
  currentUserId?: string | null;
  loading?: boolean;
  error?: string | null;
  togglingSplitId?: string | null;
  onToggleSplit?: (splitId: string, nextSettled: boolean) => void;
  onAddExpense?: () => void;
  hideAddButton?: boolean;
};

export function ExpenseLedgerView({
  expenses,
  attendees,
  currentUserId,
  loading = false,
  error = null,
  togglingSplitId = null,
  onToggleSplit,
  onAddExpense,
  hideAddButton = false,
}: ExpenseLedgerViewProps) {
  const t = useTheme();
  const debts = calculateWhoOwesWhom(expenses);

  if (loading && expenses.length === 0) {
    return (
      <View style={{ paddingVertical: t.spacing.sm, alignItems: "center" }}>
        <ActivityIndicator color={t.colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ gap: t.spacing.md }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Txt variant="label" color="heading">
          Expenses
        </Txt>
        {!hideAddButton && onAddExpense && expenses.length > 0 ? (
          <Button label="Add expense" variant="outline" onPress={onAddExpense} />
        ) : null}
      </View>

      {expenses.length === 0 ? (
        <View style={{ gap: t.spacing.sm }}>
          <Txt variant="small" color="textMuted">
            No expenses recorded yet.
          </Txt>
          {!hideAddButton && onAddExpense ? (
            <Button label="Add expense" variant="outline" onPress={onAddExpense} />
          ) : null}
        </View>
      ) : (
        <>
          {/* Who owes whom summary box */}
          <View
            style={{
              padding: t.spacing.sm,
              borderRadius: t.radius.sm,
              backgroundColor: t.colors.surfaceMuted,
              borderColor: t.colors.border,
              borderWidth: 1,
              gap: t.spacing.xs,
            }}
          >
            <Txt variant="label" color="heading">
              Who owes whom
            </Txt>
            {debts.length === 0 ? (
              <Txt variant="small" color="textMuted">
                All balances settled
              </Txt>
            ) : (
              debts.map((debt, i) => (
                <Txt key={`${debt.fromUserId}-${debt.toUserId}-${i}`} variant="small">
                  {formatDebtLine(debt, attendees, currentUserId)}
                </Txt>
              ))
            )}
          </View>

          {/* List of expenses with per-split breakdown */}
          <View style={{ gap: t.spacing.sm }}>
            {expenses.map((expense) => (
              <View
                key={expense.id}
                style={{
                  borderColor: t.colors.border,
                  borderWidth: 1,
                  borderRadius: t.radius.sm,
                  padding: t.spacing.sm,
                  gap: t.spacing.xs,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Txt variant="label" color="heading">
                    {expense.description}
                  </Txt>
                  <Txt variant="label" numeric color="heading">
                    {formatCents(expense.total_cents)}
                  </Txt>
                </View>
                <Txt variant="small" color="textMuted">
                  Paid by {attendeeName(expense.paid_by, attendees, currentUserId, { preferYou: false })}
                </Txt>

                <View style={{ marginTop: t.spacing.xs, gap: t.spacing.xs }}>
                  {expense.splits.map((split) => {
                    const isPayer = split.user_id === expense.paid_by;
                    const canToggle = canToggleSplit(split, expense, currentUserId);
                    return (
                      <View
                        key={split.id}
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.xs }}>
                          <Txt variant="small">{attendeeName(split.user_id, attendees, currentUserId)}</Txt>
                          {isPayer ? (
                            <Badge tone="neutral" label="Payer" />
                          ) : split.settled ? (
                            <Badge tone="success" label="Settled" />
                          ) : (
                            <Badge tone="warning" label="Owes" />
                          )}
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.xs }}>
                          <Txt variant="small" numeric>
                            {formatCents(split.amount_owed_cents)}
                          </Txt>
                          {canToggle && onToggleSplit ? (
                            <Button
                              label={split.settled ? "Mark unsettled" : "Mark settled"}
                              variant={split.settled ? "ghost" : "outline"}
                              onPress={() => onToggleSplit(split.id, !split.settled)}
                              loading={togglingSplitId === split.id}
                            />
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {error ? <Callout tone="danger">{error}</Callout> : null}
    </View>
  );
}

export type ExpenseLedgerProps = {
  eventId: string;
  attendees: AttendeeInfo[];
  currentUserId?: string | null;
  refreshTrigger?: number;
  onAddExpense?: () => void;
  hideAddButton?: boolean;
};

export function ExpenseLedger({
  eventId,
  attendees,
  currentUserId,
  refreshTrigger,
  onAddExpense,
  hideAddButton = false,
}: ExpenseLedgerProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingSplitId, setTogglingSplitId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void api(routes.expenses(eventId), ExpensesResponse)
      .then((res) => {
        if (!active) return;
        setExpenses(res.expenses);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        console.warn("GET /expenses failed", err);
        setError("Couldn't load expenses");
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [eventId, refreshTrigger]);

  const handleToggleSplit = async (splitId: string, nextSettled: boolean) => {
    setTogglingSplitId(splitId);
    setError(null);
    try {
      const body: PatchExpenseSplitRequest = { settled: nextSettled };
      await api(routes.expenseSplit(splitId), VoidResponse, { method: "PATCH", body });
      setExpenses((prev) =>
        prev.map((exp) => ({
          ...exp,
          splits: exp.splits.map((s) => (s.id === splitId ? { ...s, settled: nextSettled } : s)),
        }))
      );
    } catch (err) {
      console.warn("PATCH /expense-splits failed", err);
      setError("Failed to update split status");
    } finally {
      setTogglingSplitId(null);
    }
  };

  return (
    <ExpenseLedgerView
      expenses={expenses}
      attendees={attendees}
      currentUserId={currentUserId}
      loading={loading}
      error={error}
      togglingSplitId={togglingSplitId}
      onToggleSplit={handleToggleSplit}
      onAddExpense={onAddExpense}
      hideAddButton={hideAddButton}
    />
  );
}
