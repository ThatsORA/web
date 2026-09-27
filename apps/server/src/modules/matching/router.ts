import { Router } from "express";
import { routes } from "@web/contract";
import { requireAuth, requireInternal, type AuthedRequest } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { isOperator } from "../auth/helpers";
import { triggerMatcher } from "./matcher";

export const matchingRouter = Router();
matchingRouter.post(routes.runMatcher, requireInternal, async (_req, res) => {
  await triggerMatcher();
  res.json({ ok: true });
});

// Demo button, operators only (#403): it forces a pass for every squad. Reply now; the card arrives over the socket.
matchingRouter.post(routes.runScheduler, requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: (req as AuthedRequest).userId }, select: { username: true } });
  if (!user || !isOperator(user.username)) return res.status(403).json({ error: "forbidden" });
  res.status(202).end();
  void triggerMatcher({ force: true }).catch((e: unknown) => console.error("triggerMatcher", e));
});
