import { DeletePushTokenRequest, PutPushTokenRequest, routes } from "@web/contract";
import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../../lib/auth";
import { prisma } from "../../lib/prisma";

export const pushTokenRouter = Router();

pushTokenRouter.put(routes.pushToken, requireAuth, async (req, res) => {
  const body = PutPushTokenRequest.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "invalid_body" });

  const userId = (req as AuthedRequest).userId;
  await prisma.pushToken.upsert({
    where: { token: body.data.token },
    create: { userId, ...body.data },
    update: { userId, platform: body.data.platform },
  });
  return res.status(204).end();
});

pushTokenRouter.delete(routes.pushToken, requireAuth, async (req, res) => {
  const body = DeletePushTokenRequest.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "invalid_body" });

  await prisma.pushToken.deleteMany({
    where: { userId: (req as AuthedRequest).userId, token: body.data.token },
  });
  return res.status(204).end();
});
