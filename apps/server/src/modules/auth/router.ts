// Owner: Ojas — signup/login/profile. Plan: "API Contract v2".
import bcrypt from "bcryptjs";
import { Router } from "express";
import {
  AuthResponse,
  DeletePushTokenRequest,
  LoginRequest,
  Me,
  PatchMeRequest,
  SavePushTokenRequest,
  SignupRequest,
  routes,
} from "@web/contract";
import { requireAuth, signToken, type AuthedRequest } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { isUniqueViolation, roundCoord, toMe } from "./helpers";

// Compared against when the email is unknown, so login timing doesn't reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export const authRouter = Router();

authRouter.post(routes.signup, async (req, res) => {
  const parsed = SignupRequest.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body" });
  const { email, username, password, timezone } = parsed.data;
  try {
    const user = await prisma.user.create({
      data: { email, username, timezone, passwordHash: await bcrypt.hash(password, 10) },
    });
    return res.json(AuthResponse.parse({ token: signToken(user.id), user_id: user.id }));
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(409).json({ error: "email_or_username_taken" });
    throw err;
  }
});

authRouter.post(routes.login, async (req, res) => {
  const parsed = LoginRequest.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body" });
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return res.status(401).json({ error: "invalid_credentials" });
  return res.json(AuthResponse.parse({ token: signToken(user.id), user_id: user.id }));
});

authRouter.get(routes.me, requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: (req as AuthedRequest).userId } });
  if (!user) return res.status(404).json({ error: "not_found" });
  return res.json(Me.parse(toMe(user)));
});

authRouter.patch(routes.me, requireAuth, async (req, res) => {
  const parsed = PatchMeRequest.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body" });
  const { timezone, home_lat, home_lng, travel_mode } = parsed.data;
  const user = await prisma.user.update({
    where: { id: (req as AuthedRequest).userId },
    data: {
      timezone,
      travelMode: travel_mode,
      homeLat: home_lat === undefined ? undefined : roundCoord(home_lat),
      homeLng: home_lng === undefined ? undefined : roundCoord(home_lng),
    },
  });
  return res.json(Me.parse(toMe(user)));
});

authRouter.put(["/me/push-token", routes.pushToken], requireAuth, async (req, res) => {
  const parsed = SavePushTokenRequest.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body" });
  const userId = (req as AuthedRequest).userId;
  const { token, platform } = parsed.data;
  await prisma.pushToken.upsert({
    where: { token },
    create: { userId, token, platform },
    update: { userId, platform },
  });
  return res.status(204).send();
});

authRouter.delete(["/me/push-token", routes.pushToken], requireAuth, async (req, res) => {
  const parsed = DeletePushTokenRequest.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body" });
  const userId = (req as AuthedRequest).userId;
  const { token } = parsed.data;
  await prisma.pushToken.deleteMany({
    where: { userId, token },
  });
  return res.status(204).send();
});
