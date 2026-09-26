// Owner: Ojas — 6-digit email codes for verify / reset / change_email (#91; reused by #92 and #96).
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { EmailCodePurpose } from "@prisma/client";
import { env } from "../../env";
import { prisma } from "../../lib/prisma";

export const CODE_TTL_MS = 10 * 60_000;
export const RESEND_COOLDOWN_MS = 60_000;
export const MAX_ATTEMPTS = 5;

export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

// Keyed with a server secret: a plain hash of a 6-digit code is reversed in milliseconds if the DB leaks.
export const hashCode = (code: string) => createHmac("sha256", env.JWT_SECRET).update(code).digest("hex");

type Stored = { codeHash: string; expiresAt: Date; attempts: number };
export type CodeResult = "ok" | "wrong" | "expired" | "locked" | "missing";

/** Checks a submitted code against the stored row. Constant-time compare. */
export function checkCode(row: Stored | null, code: string, now: Date): CodeResult {
  if (!row) return "missing";
  if (row.attempts >= MAX_ATTEMPTS) return "locked";
  if (row.expiresAt <= now) return "expired";
  const want = Buffer.from(row.codeHash, "hex");
  const got = Buffer.from(hashCode(code), "hex");
  return want.length === got.length && timingSafeEqual(want, got) ? "ok" : "wrong";
}

/** Milliseconds until another code may be sent (0 = now). */
export const cooldownLeftMs = (lastSentAt: Date | null, now: Date) =>
  lastSentAt ? Math.max(0, lastSentAt.getTime() + RESEND_COOLDOWN_MS - now.getTime()) : 0;

/** Issue a fresh code (invalidating the previous one), or say how long to wait. Returns the plain code to email. */
export async function issueCode(
  userId: string,
  purpose: EmailCodePurpose,
  newEmail: string | null = null,
  now = new Date(),
): Promise<{ code: string } | { retryAfterMs: number }> {
  const last = await prisma.emailCode.findFirst({ where: { userId, purpose }, orderBy: { createdAt: "desc" } });
  const retryAfterMs = cooldownLeftMs(last?.createdAt ?? null, now);
  if (retryAfterMs > 0) return { retryAfterMs };
  const code = newCode();
  await prisma.emailCode.deleteMany({ where: { userId, purpose } });
  await prisma.emailCode.create({
    data: { userId, purpose, codeHash: hashCode(code), newEmail, expiresAt: new Date(now.getTime() + CODE_TTL_MS), createdAt: now },
  });
  return { code };
}

/** Check and, on success, consume a code. Every check burns an attempt, claimed atomically so parallel guesses can't exceed the limit. */
export async function consumeCode(
  userId: string,
  purpose: EmailCodePurpose,
  code: string,
  now = new Date(),
): Promise<{ result: CodeResult; newEmail: string | null }> {
  const row = await prisma.emailCode.findFirst({ where: { userId, purpose } });
  const result = checkCode(row, code, now);
  if (!row || (result !== "ok" && result !== "wrong")) return { result, newEmail: null };
  const claimed = await prisma.emailCode.updateMany({
    where: { id: row.id, attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (!claimed.count) return { result: "locked", newEmail: null };
  if (result === "wrong") return { result, newEmail: null };
  // deleteMany + count so two parallel correct submissions can't both use it.
  const used = await prisma.emailCode.deleteMany({ where: { id: row.id } });
  return used.count ? { result: "ok", newEmail: row.newEmail } : { result: "missing", newEmail: null };
}
