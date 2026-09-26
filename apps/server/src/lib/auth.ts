// Shared JWT middleware. Owner: Ojas (auth lane) — everyone imports it.
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../env";

export interface AuthedRequest extends Request {
  userId: string;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    return typeof payload === "object" && typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const userId = header.startsWith("Bearer ") ? verifyToken(header.slice(7)) : null;
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
