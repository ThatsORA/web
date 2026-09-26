// Owner: Ojas — expense ledger (plan §12, stretch). Integer cents everywhere.
import { Router, type Request } from "express";
import { CreateExpenseRequest, PatchExpenseSplitRequest, routes } from "@web/contract";
import { requireAuth, type AuthedRequest } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import type { Prisma } from "@prisma/client";
import { splitEqually } from "./split";

export const expensesRouter = Router();
expensesRouter.use(requireAuth);

/** Confirmed attendees of the event, ordered for the rounding rule; null if the caller isn't in the event. */
async function attendeesFor(req: Request) {
  const userId = (req as AuthedRequest).userId;
  const event = await prisma.event.findUnique({
    where: { id: String(req.params.id) },
    include: { participants: { select: { userId: true, voteStatus: true }, orderBy: { userId: "asc" } } },
  });
  if (!event || !event.participants.some((p) => p.userId === userId)) return null;
  const confirmed = event.participants.filter((p) => p.voteStatus === "confirmed").map((p) => p.userId);
  return { event, userId, confirmed };
}

expensesRouter.post(routes.expenses(":id"), async (req, res) => {
  const body = CreateExpenseRequest.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "invalid_body", message: body.error.message });
  const found = await attendeesFor(req);
  if (!found) return res.status(404).json({ error: "not_found" });
  const { event, userId, confirmed } = found;
  if (event.status !== "confirmed" && event.status !== "completed") return res.status(409).json({ error: "event_not_confirmed" });
  if (!confirmed.includes(userId)) return res.status(403).json({ error: "not_attendee" });

  const expense = await prisma.expense.create({
    data: {
      eventId: event.id,
      paidBy: userId,
      totalCents: body.data.total_cents,
      description: body.data.description,
      splits: {
        create: splitEqually(body.data.total_cents, confirmed).map((s) => ({
          userId: s.userId,
          amountOwedCents: s.amountCents,
          settled: s.userId === userId, // the payer doesn't owe themselves
        })),
      },
    },
    include: { splits: true },
  });
  res.status(201).json(toJson(expense));
});

expensesRouter.get(routes.expenses(":id"), async (req, res) => {
  const found = await attendeesFor(req);
  if (!found) return res.status(404).json({ error: "not_found" });
  const expenses = await prisma.expense.findMany({
    where: { eventId: found.event.id },
    include: { splits: true },
    orderBy: { createdAt: "asc" },
  });
  res.json({ expenses: expenses.map(toJson) });
});

expensesRouter.patch(routes.expenseSplit(":id"), async (req, res) => {
  const body = PatchExpenseSplitRequest.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "invalid_body", message: body.error.message });
  const userId = (req as AuthedRequest).userId;
  const split = await prisma.expenseSplit.findUnique({ where: { id: String(req.params.id) }, include: { expense: true } });
  // Only the payer or the person who owes can toggle it; 404 hides splits you aren't part of.
  if (!split || (split.userId !== userId && split.expense.paidBy !== userId)) return res.status(404).json({ error: "not_found" });
  await prisma.expenseSplit.update({ where: { id: split.id }, data: { settled: body.data.settled } });
  res.status(204).end();
});

const toJson = (e: Prisma.ExpenseGetPayload<{ include: { splits: true } }>) => ({
  id: e.id,
  paid_by: e.paidBy,
  total_cents: e.totalCents,
  description: e.description,
  created_at: e.createdAt.toISOString(),
  splits: e.splits.map((s) => ({ id: s.id, user_id: s.userId, amount_owed_cents: s.amountOwedCents, settled: s.settled })),
});
