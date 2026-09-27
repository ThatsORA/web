// Owner: Ojas — signup/login/profile. Plan: "API Contract v2".
import { Router, type Response } from "express";
import {
  ApiError,
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
  WeakPasswordResponse,
  routes,
} from "@web/contract";
import { requireAuth, signToken, type AuthedRequest } from "../../lib/auth";
import { env } from "../../env";
import { prisma } from "../../lib/prisma";
import { sendCodeEmail, sendEmail } from "./email";
import { consumeCode, issueCode } from "./emailCode";
import { isUniqueViolation, roundCoord, toMe, usernameRetryAt } from "./helpers";
import { hashPassword, verifyPassword } from "./passwordHash";
import { passwordResetRouter } from "./passwordReset";
import { loginLimiter } from "./loginLimiter";

// Compared against when the email is unknown, so login timing doesn't reveal which accounts exist.
const DUMMY_HASH = hashPassword("not-a-real-password");

export const authRouter = Router();
authRouter.use(passwordResetRouter);

const emailUnavailable = (res: Response) =>
  res.status(503).json(ApiError.parse({ error: "email_unavailable" }));

authRouter.post(routes.signup, async (req, res) => {
  const parsed = SignupRequest.safeParse(req.body);
  if (!parsed.success) {
    const weakPassword = parsed.error.issues.find((issue) => issue.code === "custom" && issue.params?.error === "weak_password");
    return res.status(400).json(weakPassword
      ? WeakPasswordResponse.parse({ error: "weak_password", reason: weakPassword.message })
      : ApiError.parse({ error: "invalid_body" }));
  }
  const { email, username, password, timezone } = parsed.data;
  try {
    const user = await prisma.user.create({
      // Explicit null = unverified. Accounts made outside sign-up lack the field and are backfilled as verified.
      data: { email, username, timezone, passwordHash: await hashPassword(password), emailVerifiedAt: null },
    });
    if (env.EMAIL_VERIFICATION_REQUIRED) {
      const issued = await issueCode(user.id, "verify");
      if ("code" in issued) {
        try {
          await sendCodeEmail(user.email, issued.code);
        } catch {
          // The account has not been returned to the client, so remove it and let signup retry cleanly.
          await prisma.user.delete({ where: { id: user.id } });
          return emailUnavailable(res);
        }
      }
    }
    return res.json(AuthResponse.parse({ token: signToken(user.id), user_id: user.id }));
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(409).json({ error: "email_or_username_taken" });
    throw err;
  }
});

authRouter.post(routes.login, async (req, res) => {
  const parsed = LoginRequest.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body" });
  const { identifier } = parsed.data; // already trimmed + lowercased by the contract
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const retryAfter = loginLimiter.retryAfter(identifier, ip);
  if (retryAfter) return res.status(429).set("Retry-After", String(retryAfter)).json(ApiError.parse({ error: "too_many_attempts" }));
  const user = await prisma.user.findUnique({ where: identifier.includes("@") ? { email: identifier } : { username: identifier } });
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? await DUMMY_HASH);
  if (!user || !ok) {
    loginLimiter.failed(identifier, ip);
    return res.status(401).json({ error: "invalid_credentials" });
  }
  loginLimiter.succeeded(identifier, ip);
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
  try {
    await sendCodeEmail(user.email, issued.code);
  } catch {
    // Failed deliveries must not start the resend cooldown.
    await prisma.emailCode.deleteMany({ where: { userId: user.id, purpose: "verify" } });
    return emailUnavailable(res);
  }
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
  const { timezone, home_lat, home_lng, travel_mode, display_name, bio, pref_activities, pref_personality, budget, username } = parsed.data;
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
        prefActivities: pref_activities === "" ? null : pref_activities,
        prefPersonality: pref_personality === "" ? null : pref_personality,
        budget,
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
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) return res.status(401).json({ error: "invalid_credentials" });
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
