// Owner: Ojas — STRETCH, only after the hour-20 checkpoint passes.
import { Router } from "express";
import { requireAuth } from "../../lib/auth";
import { notImplemented } from "../../lib/notImplemented";

export const expensesRouter = Router();
expensesRouter.use(requireAuth);
expensesRouter.post("/events/:id/expenses", notImplemented("Ojas"));
expensesRouter.get("/events/:id/expenses", notImplemented("Ojas"));
expensesRouter.patch("/expense-splits/:id", notImplemented("Ojas"));
