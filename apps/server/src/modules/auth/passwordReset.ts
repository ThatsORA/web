import { Router } from "express";
import { ApiError, PasswordResetRequest, PasswordResetConfirmRequest, PasswordResetAccepted, PasswordResetSuccess, WeakPasswordResponse, checkPassword, routes } from "@web/contract";
import { disconnectUser } from "../../realtime";
import { prisma } from "../../lib/prisma";
import { consumeCode, issueCode } from "./emailCode";
import { sendCodeEmail } from "./email";
import { hashPassword } from "./passwordHash";

export const passwordResetRouter = Router();
class WeakPasswordError extends Error {}

async function sendReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  const issued = await issueCode(user.id, "reset");
  if ("code" in issued) await sendCodeEmail(user.email, issued.code);
}

passwordResetRouter.post(routes.passwordResetRequest, (req, res) => {
  const parsed = PasswordResetRequest.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(ApiError.parse({ error: "invalid_body" }));
  // Respond before account lookup or provider work completes, for every address.
  // Cooldown, absent accounts and delivery failures all have the same public result.
  // ponytail: in-process delivery; a durable job queue is needed for crash-safe delivery.
  void sendReset(parsed.data.email).catch(() => console.error("Password-reset email delivery failed"));
  return res.status(202).json(PasswordResetAccepted.parse({ accepted: true }));
});

passwordResetRouter.post(routes.passwordResetConfirm, async (req, res) => {
  const parsed = PasswordResetConfirmRequest.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(ApiError.parse({ error: "invalid_body" }));
  const { email, code, new_password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(400).json(ApiError.parse({ error: "invalid_reset_code" }));
  let reset: boolean;
  try {
    reset = await prisma.$transaction(async (tx) => {
      const { result } = await consumeCode(user.id, "reset", code, new Date(), tx);
      // Returning normally commits wrong-code attempt increments too.
      if (result !== "ok") return false;
      const check = checkPassword(new_password, user);
      // Only someone holding a valid code may see identity-specific policy reasons.
      // Throwing rolls back consumption so they can correct a weak password.
      if (!check.ok) throw new WeakPasswordError(check.reason);
      const passwordHash = await hashPassword(new_password);
      await tx.user.update({ where: { id: user.id }, data: { passwordHash, passwordChangedAt: new Date() } });
      await tx.emailCode.deleteMany({ where: { userId: user.id, purpose: "reset" } });
      return true;
    });
  } catch (error) {
    if (error instanceof WeakPasswordError) return res.status(400).json(WeakPasswordResponse.parse({ error: "weak_password", reason: error.message }));
    throw error;
  }
  if (!reset) return res.status(400).json(ApiError.parse({ error: "invalid_reset_code" }));
  disconnectUser(user.id);
  return res.json(PasswordResetSuccess.parse({ reset: true }));
});
