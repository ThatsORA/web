// Owner: Ojas — money in the expense form. Integer cents only; never floats.

/** "12", "12.5" or "12.50" → cents; null for anything else. */
export function parseCents(text: string): number | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")) : null;
}

/** 1250 → "$12.50" */
export const formatCents = (cents: number) => `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;

/** The live line under the custom inputs; `done` once the amounts sum exactly to the total. */
export function remainingLine(totalCents: number, amounts: number[]): { text: string; done: boolean } {
  const left = totalCents - amounts.reduce((a, b) => a + b, 0);
  if (left === 0) return { text: "All assigned", done: true };
  return { text: left > 0 ? `${formatCents(left)} left to assign` : `Over by ${formatCents(-left)}`, done: false };
}
