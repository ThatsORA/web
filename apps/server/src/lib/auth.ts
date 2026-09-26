// Shared JWT middleware. Owner: Ojas (auth lane) — everyone imports it.
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "./prisma";
import { env } from "../env";

export interface AuthedRequest extends Request {
  userId: string;
}

export function signToken(userId: string): string {
  const now = Date.now();
  return jwt.sign({ sub: userId, iat: Math.floor(now / 1000), issued_at_ms: now }, env.JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    return typeof payload === "object" && typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Verify signature, expiry, account existence and password-reset freshness. */
export async function verifySessionToken(token: string): Promise<string | null> {
  let payload: jwt.JwtPayload | null = null;
  try {
    const verified = jwt.verify(token, env.JWT_SECRET);
    if (typeof verified === "object") payload = verified;
  } catch { return null; }
  if (!payload || typeof payload.sub !== "string") return null;
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { passwordChangedAt: true } });
  if (!user) return null;
  if (user.passwordChangedAt) {
    // JWT iat uses seconds; signed milliseconds allow login immediately after a
    // reset in that same second. Legacy tokens fall back to iat * 1000.
    const issuedAt = "issued_at_ms" in payload
      ? typeof payload.issued_at_ms === "number" ? payload.issued_at_ms : NaN
      : typeof payload.iat === "number" ? payload.iat * 1000 : NaN;
    if (!Number.isFinite(issuedAt) || issuedAt < user.passwordChangedAt.getTime()) return null;
  }
  return payload.sub;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const userId = header.startsWith("Bearer ") ? await verifySessionToken(header.slice(7)) : null;
  if (!userId) return res.status(401).json({ error: "unauthorized" });
  (req as AuthedRequest).userId = userId;
  next();
}

export function requireInternal(req: Request, res: Response, next: NextFunction) {
  if (req.header("x-internal-secret") !== env.INTERNAL_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}
