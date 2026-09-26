/** Equal split in integer cents; leftover cents go one each to the first users (plan §Schema: 1000 ÷ 3 → 334/333/333). */
export function splitEqually(totalCents: number, userIds: string[]): { userId: string; amountCents: number }[] {
  const base = Math.floor(totalCents / userIds.length);
  const leftover = totalCents - base * userIds.length;
  return userIds.map((userId, i) => ({ userId, amountCents: base + (i < leftover ? 1 : 0) }));
}

/** Why a custom split is invalid (distinct confirmed attendees, summing exactly to the total), or null if it's fine. */
export function customSplitError(totalCents: number, splits: { user_id: string; amount_cents: number }[], attendees: string[]) {
  const users = splits.map((s) => s.user_id);
  if (new Set(users).size !== users.length) return "duplicate_user";
  if (users.some((u) => !attendees.includes(u))) return "not_attendee";
  if (splits.reduce((sum, s) => sum + s.amount_cents, 0) !== totalCents) return "sum_mismatch";
  return null;
}
