// Owner: Ojas — signup/login/profile. Plan: "API Contract v2".
import bcrypt from "bcryptjs";
import { Router } from "express";
import { AuthResponse, LoginRequest, Me, PatchMeRequest, SignupRequest, VerifyEmailRequest, routes } from "@web/contract";
import { requireAuth, signToken, type AuthedRequest } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { sendCodeEmail } from "./email";
import { consumeCode, issueCode } from "./emailCode";
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
      // Explicit null = unverified. Accounts made outside sign-up lack the field and are backfilled as verified.
      data: { email, username, timezone, passwordHash: await bcrypt.hash(password, 10), emailVerifiedAt: null },
    });
    void issueCode(user.id, "verify")
      .then((issued) => ("code" in issued ? sendCodeEmail(user.email, issued.code) : undefined))
      .catch((e: unknown) => console.error("signup verify email", e)); // they can resend from the app
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

authRouter.post(routes.verifyEmailSend, requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: (req as AuthedRequest).userId } });
  if (!user) return res.status(404).json({ error: "not_found" });
  if (user.emailVerifiedAt) return res.status(409).json({ error: "already_verified" });
  const issued = await issueCode(user.id, "verify");
  if ("retryAfterMs" in issued) {
    return res.status(429).set("Retry-After", String(Math.ceil(issued.retryAfterMs / 1000))).json({ error: "cooldown" });
  }
  await sendCodeEmail(user.email, issued.code);
  return res.status(204).end();
});

authRouter.post(routes.verifyEmail, requireAuth, async (req, res) => {
  const parsed = VerifyEmailRequest.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body" });
  const userId = (req as AuthedRequest).userId;
  const { result } = await consumeCode(userId, "verify", parsed.data.code);
  if (result === "wrong") return res.status(400).json({ error: "wrong_code" });
  // Expired, out of attempts, or never sent: the app offers "Send a new code".
  if (result !== "ok") return res.status(400).json({ error: "code_expired" });
  const user = await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return res.json(Me.parse(toMe(user)));
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
