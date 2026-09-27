// Owner: Ojas — expense ledger calculations and netting. Integer cents only; never floats.
import type { Expense, ExpenseSplit } from "@web/contract";
import { formatCents } from "./amounts";

export type DebtSummary = {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
};

export type AttendeeInfo = {
  id: string;
  username: string;
  display_name?: string;
};

/**
 * Computes net unsettled debts between participants across all expenses.
 * Unsettled splits where split.user_id !== expense.paid_by create an obligation
 * from split.user_id to expense.paid_by. Obligations between pairs are netted out.
 */
export function calculateWhoOwesWhom(expenses: Expense[]): DebtSummary[] {
  const directedDebt = new Map<string, number>();

  for (const expense of expenses) {
    for (const split of expense.splits) {
      if (split.settled) continue;
      if (split.user_id === expense.paid_by) continue;
      if (split.amount_owed_cents <= 0) continue;

      const key = `${split.user_id}:${expense.paid_by}`;
      directedDebt.set(key, (directedDebt.get(key) ?? 0) + split.amount_owed_cents);
    }
  }

  const users = new Set<string>();
  for (const key of directedDebt.keys()) {
    const [u1, u2] = key.split(":");
    if (u1) users.add(u1);
    if (u2) users.add(u2);
  }

  const userList = Array.from(users).sort();
  const debts: DebtSummary[] = [];

  for (let i = 0; i < userList.length; i++) {
    for (let j = i + 1; j < userList.length; j++) {
      const u1 = userList[i]!;
      const u2 = userList[j]!;
      const d12 = directedDebt.get(`${u1}:${u2}`) ?? 0;
      const d21 = directedDebt.get(`${u2}:${u1}`) ?? 0;
      const net = d12 - d21;
      if (net > 0) {
        debts.push({ fromUserId: u1, toUserId: u2, amountCents: net });
      } else if (net < 0) {
        debts.push({ fromUserId: u2, toUserId: u1, amountCents: -net });
      }
    }
  }

  return debts;
}

/** Resolves an attendee's human-friendly display name. */
export function attendeeName(
  userId: string,
  attendees: AttendeeInfo[],
  currentUserId?: string | null,
  options: { preferYou?: boolean } = {}
): string {
  const isMe = !!currentUserId && userId === currentUserId;
  if (isMe && options.preferYou) {
    return "You";
  }
  const found = attendees.find((a) => a.id === userId);
  const base = found?.display_name || found?.username || "Unknown";
  if (isMe) {
    return `${base} (You)`;
  }
  return base;
}

/** Human-readable sentence for who owes whom: "You owe Andy $12.50" or "Bob owes you $5.00". */
export function formatDebtLine(
  debt: DebtSummary,
  attendees: AttendeeInfo[],
  currentUserId?: string | null
): string {
  const isFromMe = !!currentUserId && debt.fromUserId === currentUserId;
  const isToMe = !!currentUserId && debt.toUserId === currentUserId;

  const fromName = isFromMe ? "You" : attendeeName(debt.fromUserId, attendees, currentUserId, { preferYou: false });
  const toName = isToMe ? "you" : attendeeName(debt.toUserId, attendees, currentUserId, { preferYou: false });

  if (isFromMe) {
    return `You owe ${toName} ${formatCents(debt.amountCents)}`;
  }
  if (isToMe) {
    return `${fromName} owes you ${formatCents(debt.amountCents)}`;
  }
  return `${fromName} owes ${toName} ${formatCents(debt.amountCents)}`;
}

/** Determines if a user is involved in a debt summary line (either as debtor or creditor). */
export function isUserInvolvedInDebt(debt: DebtSummary, userId?: string | null): boolean {
  if (!userId) return false;
  return debt.fromUserId === userId || debt.toUserId === userId;
}

/** Determines text color tone for a debt summary line based on current user perspective. */
export function getDebtColorTone(
  debt: DebtSummary,
  currentUserId?: string | null
): "danger" | "success" | undefined {
  if (!currentUserId) return undefined;
  if (debt.fromUserId === currentUserId) return "danger";
  if (debt.toUserId === currentUserId) return "success";
  return undefined;
}

/** Only the payer or the debtor can toggle the settled state of a split (server returns 404 otherwise). */
export function canToggleSplit(
  split: ExpenseSplit,
  expense: Expense,
  currentUserId?: string | null
): boolean {
  if (!currentUserId) return false;
  if (split.user_id === expense.paid_by) return false; // payer's own share is settled by definition
  return split.user_id === currentUserId || expense.paid_by === currentUserId;
}

