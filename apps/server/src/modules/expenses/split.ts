/** Equal split in integer cents; leftover cents go one each to the first users (plan §Schema: 1000 ÷ 3 → 334/333/333). */
export function splitEqually(totalCents: number, userIds: string[]): { userId: string; amountCents: number }[] {
  const base = Math.floor(totalCents / userIds.length);
  const leftover = totalCents - base * userIds.length;
  return userIds.map((userId, i) => ({ userId, amountCents: base + (i < leftover ? 1 : 0) }));
}
