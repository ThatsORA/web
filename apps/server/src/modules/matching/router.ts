import { Router } from "express";
import { routes } from "@web/contract";
import { requireInternal } from "../../lib/auth";
import { triggerMatcher } from "./matcher";

export const matchingRouter = Router();
matchingRouter.post(routes.runMatcher, requireInternal, async (_req, res) => {
  await triggerMatcher();
  res.json({ ok: true });
});
