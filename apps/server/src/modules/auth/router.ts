// Owner: Ojas — signup/login/profile. Plan: "API Contract v2".
import bcrypt from "bcryptjs";
import { Router } from "express";
import {
  AuthResponse,
  ChangeEmailRequest,
  ConfirmEmailChangeRequest,
  DeletePushTokenRequest,
  LoginRequest,
  Me,
  PatchMeRequest,
  SavePushTokenRequest,
  SignupRequest,
  VerifyEmailRequest,
  routes,
} from "@web/contract";
import { requireAuth, signToken, type AuthedRequest } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { sendCodeEmail, sendEmail } from "./email";
import { consumeCode, issueCode } from "./emailCode";
import { isUniqueViolation, roundCoord, toMe, usernameRetryAt } from "./helpers";

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
  const { timezone, home_lat, home_lng, travel_mode, display_name, bio, username } = parsed.data;
  const userId = (req as AuthedRequest).userId;
  let usernameChangedAt: Date | undefined;
  if (username !== undefined) {
    const current = await prisma.user.findUnique({ where: { id: userId } });
    if (!current) return res.status(404).json({ error: "not_found" });
    if (username !== current.username) {
      const retryAt = usernameRetryAt(current.usernameChangedAt, new Date());
      if (retryAt) return res.status(409).json({ error: "username_cooldown", retry_at: retryAt.toISOString() });
      usernameChangedAt = new Date();
    }
  }
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        timezone,
        travelMode: travel_mode,
        homeLat: home_lat === undefined ? undefined : roundCoord(home_lat),
        homeLng: home_lng === undefined ? undefined : roundCoord(home_lng),
        displayName: display_name,
        bio: bio === "" ? null : bio,
        ...(usernameChangedAt ? { username, usernameChangedAt } : {}),
      },
    });
    return res.json(Me.parse(toMe(user)));
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(409).json({ error: "username_taken" });
    throw err;
  }
});

// Email change: prove the password, then prove the new address with a code sent to it.
authRouter.post(routes.meEmail, requireAuth, async (req, res) => {
  const parsed = ChangeEmailRequest.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body" });
  const user = await prisma.user.findUnique({ where: { id: (req as AuthedRequest).userId } });
  if (!user) return res.status(404).json({ error: "not_found" });
  if (!(await bcrypt.compare(parsed.data.password, user.passwordHash))) return res.status(401).json({ error: "invalid_credentials" });
  const newEmail = parsed.data.new_email;
  if (newEmail === user.email) return res.status(400).json({ error: "same_email" });
  if (await prisma.user.findUnique({ where: { email: newEmail } })) return res.status(409).json({ error: "email_taken" });
  const issued = await issueCode(user.id, "change_email", newEmail);
  if ("retryAfterMs" in issued) {
    return res.status(429).set("Retry-After", String(Math.ceil(issued.retryAfterMs / 1000))).json({ error: "cooldown" });
  }
  await sendCodeEmail(newEmail, issued.code);
  return res.status(204).end();
});

authRouter.post(routes.meEmailConfirm, requireAuth, async (req, res) => {
  const parsed = ConfirmEmailChangeRequest.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body" });
  const userId = (req as AuthedRequest).userId;
  const { result, newEmail } = await consumeCode(userId, "change_email", parsed.data.code);
  if (result === "wrong") return res.status(400).json({ error: "wrong_code" });
  if (result !== "ok" || !newEmail) return res.status(400).json({ error: "code_expired" });
  const before = await prisma.user.findUnique({ where: { id: userId } });
  if (!before) return res.status(404).json({ error: "not_found" });
  try {
    const user = await prisma.user.update({ where: { id: userId }, data: { email: newEmail, emailVerifiedAt: new Date() } });
    void sendEmail(
      before.email,
      "Your Web email was changed",
      `Your Web account now uses ${newEmail}. If this wasn't you, change your password right away.`,
    ).catch((e: unknown) => console.error("old-email notice", e));
    return res.json(Me.parse(toMe(user)));
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(409).json({ error: "email_taken" });
    throw err;
  }
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
