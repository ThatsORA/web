// Owner: Ojas — expense ledger component. Displays expenses, equal split calculations,
// net balance breakdown, and settled toggles per split. Mounted on ConfirmedCard.
import { ExpensesResponse, type Expense, type PatchExpenseSplitRequest, routes } from "@web/contract";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { z } from "zod";
import { api } from "../../lib/api";
import { Badge, Button, Callout, Modal, Txt, useTheme } from "../../ui";
import { formatCents } from "./amounts";
import {
  attendeeName,
  calculateWhoOwesWhom,
  canToggleSplit,
  formatDebtLine,
  getDebtColorTone,
  isUserInvolvedInDebt,
  type AttendeeInfo,
  type DebtSummary,
} from "./ledger";

const VoidResponse = z.unknown();

export type ExpenseLedgerViewProps = {
  expenses: Expense[];
  attendees: AttendeeInfo[];
  currentUserId?: string | null;
  loading?: boolean;
  error?: string | null;
  togglingSplitId?: string | null;
  confirmingDebt?: DebtSummary | null;
  onToggleSplit?: (splitId: string, nextSettled: boolean) => void;
  onSettleDebt?: (fromUserId: string, toUserId: string) => void;
  onPressSettleDebt?: (debt: DebtSummary) => void;
  onConfirmSettleDebt?: (debt: DebtSummary) => void;
  onCancelSettleDebt?: () => void;
  onAddExpense?: () => void;
  hideAddButton?: boolean;
  initialModalOpen?: boolean;
};

export function ExpenseLedgerView({
  expenses,
  attendees,
  currentUserId,
  loading = false,
  error = null,
  togglingSplitId = null,
  confirmingDebt = null,
  onToggleSplit,
  onSettleDebt,
  onPressSettleDebt,
  onConfirmSettleDebt,
  onCancelSettleDebt,
  onAddExpense,
  hideAddButton = false,
  initialModalOpen = false,
}: ExpenseLedgerViewProps) {
  const t = useTheme();
  const debts = calculateWhoOwesWhom(expenses);
  const [isModalOpen, setIsModalOpen] = useState(initialModalOpen);

  if (loading && expenses.length === 0) {
    return (
      <View style={{ paddingVertical: t.spacing.sm, alignItems: "center" }}>
        <ActivityIndicator color={t.colors.primary} />
      </View>
    );
  }

  const handleConfirmSettle = (debt: DebtSummary) => {
    if (onConfirmSettleDebt) {
      onConfirmSettleDebt(debt);
    } else if (onSettleDebt) {
      onSettleDebt(debt.fromUserId, debt.toUserId);
    } else if (onToggleSplit) {
      const splitsToSettle = expenses.flatMap((exp) =>
        exp.splits.filter((s) => {
          if (s.settled) return false;
          const isFromUser = s.user_id === debt.fromUserId && exp.paid_by === debt.toUserId;
          const isToUser = s.user_id === debt.toUserId && exp.paid_by === debt.fromUserId;
          return isFromUser || isToUser;
        })
      );
      splitsToSettle.forEach((s) => onToggleSplit(s.id, true));
    }
  };

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
          {/* Net balance summary box */}
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
            {debts.length === 0 ? (
              <Txt variant="small" color="textMuted">
                All balances settled
              </Txt>
            ) : (
              debts.map((debt, i) => {
                const isInvolved = isUserInvolvedInDebt(debt, currentUserId);
                const debtColor = getDebtColorTone(debt, currentUserId);

                return (
                  <View
                    key={`${debt.fromUserId}-${debt.toUserId}-${i}`}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: t.spacing.sm,
                    }}
                  >
                    <Txt variant="small" color={debtColor} style={{ flexShrink: 1 }}>
                      {formatDebtLine(debt, attendees, currentUserId)}
                    </Txt>
                    {isInvolved && (onPressSettleDebt || onConfirmSettleDebt || onSettleDebt || onToggleSplit) ? (
                      <Button
                        label="Settle"
                        variant="outline"
                        size="sm"
                        onPress={() => (onPressSettleDebt ? onPressSettleDebt(debt) : handleConfirmSettle(debt))}
                      />
                    ) : null}
                  </View>
                );
              })
            )}
          </View>

          {/* View all expenses button */}
          <Button label="View all expenses" variant="outline" onPress={() => setIsModalOpen(true)} />

          {/* Modal displaying itemized expenses list with paid by info, totals, and per-split breakdown */}
          <Modal visible={isModalOpen} onClose={() => setIsModalOpen(false)} title="All expenses">
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

                  <View style={{ marginTop: t.spacing.xs, gap: t.spacing.sm }}>
                    {expense.splits.map((split, splitIndex) => {
                      const isPayer = split.user_id === expense.paid_by;
                      const canToggle = canToggleSplit(split, expense, currentUserId);
                      return (
                        <View
                          key={split.id}
                          style={{
                            paddingTop: splitIndex > 0 ? t.spacing.xs : 0,
                            borderTopWidth: splitIndex > 0 ? 1 : 0,
                            borderTopColor: t.colors.border,
                            gap: t.spacing.xs,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: t.spacing.sm,
                            }}
                          >
                            <Txt variant="small" style={{ flexShrink: 1 }}>
                              {attendeeName(split.user_id, attendees, currentUserId)}
                            </Txt>
                            <Txt variant="small" numeric color="heading">
                              {formatCents(split.amount_owed_cents)}
                            </Txt>
                          </View>
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                              flexWrap: "wrap",
                              gap: t.spacing.xs,
                            }}
                          >
                            {isPayer ? (
                              <Badge tone="neutral" label="Payer" />
                            ) : split.settled ? (
                              <Badge tone="success" label="Settled" />
                            ) : (
                              <Badge tone="warning" label="Owes" />
                            )}
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
          </Modal>
        </>
      )}

      {/* Confirmation modal for net balance settlement */}
      {confirmingDebt ? (
        <Modal
          visible={!!confirmingDebt}
          transparent
          animationType="fade"
          onRequestClose={onCancelSettleDebt}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              justifyContent: "center",
              alignItems: "center",
              padding: t.spacing.md,
            }}
          >
            <View
              style={{
                backgroundColor: t.colors.surface,
                borderRadius: t.radius.sm,
                borderColor: t.colors.border,
                borderWidth: 1,
                padding: t.spacing.md,
                gap: t.spacing.md,
                maxWidth: 400,
                width: "100%",
              }}
            >
              <Txt variant="section" color="heading">
                Mark balance settled?
              </Txt>
              <Txt variant="body">
                Are you sure you want to mark this balance as settled?
              </Txt>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: t.spacing.sm }}>
                <Button
                  label="Cancel"
                  variant="ghost"
                  onPress={onCancelSettleDebt}
                />
                <Button
                  label="Mark settled"
                  onPress={() => handleConfirmSettle(confirmingDebt)}
                />
              </View>
            </View>
          </View>
        </Modal>
      ) : null}

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
  const [confirmingDebt, setConfirmingDebt] = useState<DebtSummary | null>(null);

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

  const handleSettleDebt = async (fromUserId: string, toUserId: string) => {
    const splitsToSettle = expenses.flatMap((exp) =>
      exp.splits.filter((s) => {
        if (s.settled) return false;
        const isFromUser = s.user_id === fromUserId && exp.paid_by === toUserId;
        const isToUser = s.user_id === toUserId && exp.paid_by === fromUserId;
        return isFromUser || isToUser;
      })
    );

    if (splitsToSettle.length === 0) return;

    setError(null);
    try {
      const body: PatchExpenseSplitRequest = { settled: true };
      await Promise.all(
        splitsToSettle.map((split) =>
          api(routes.expenseSplit(split.id), VoidResponse, { method: "PATCH", body })
        )
      );
      const splitIds = new Set(splitsToSettle.map((s) => s.id));
      setExpenses((prev) =>
        prev.map((exp) => ({
          ...exp,
          splits: exp.splits.map((s) => (splitIds.has(s.id) ? { ...s, settled: true } : s)),
        }))
      );
    } catch (err) {
      console.warn("PATCH /expense-splits failed", err);
      setError("Failed to update split status");
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
      confirmingDebt={confirmingDebt}
      onToggleSplit={handleToggleSplit}
      onSettleDebt={handleSettleDebt}
      onPressSettleDebt={(debt) => setConfirmingDebt(debt)}
      onConfirmSettleDebt={(debt) => {
        setConfirmingDebt(null);
        void handleSettleDebt(debt.fromUserId, debt.toUserId);
      }}
      onCancelSettleDebt={() => setConfirmingDebt(null)}
      onAddExpense={onAddExpense}
      hideAddButton={hideAddButton}
    />
  );
}


