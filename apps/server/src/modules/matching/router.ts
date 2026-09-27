import { Router } from "express";
import { routes } from "@web/contract";
import { requireAuth, requireInternal } from "../../lib/auth";
import { triggerMatcher } from "./matcher";

export const matchingRouter = Router();
matchingRouter.post(routes.runMatcher, requireInternal, async (_req, res) => {
  await triggerMatcher();
  res.json({ ok: true });
});

// Demo button: reply now; the card arrives over the socket.
matchingRouter.post(routes.runScheduler, requireAuth, (_req, res) => {
  res.status(202).end();
  void triggerMatcher({ force: true }).catch((e: unknown) => console.error("triggerMatcher", e));
});
