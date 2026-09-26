import type { Request, Response } from "express";

/** Placeholder handler — replace when you implement the route. */
export const notImplemented = (owner: string) => (req: Request, res: Response) =>
  res.status(501).json({ error: "not_implemented", message: `${req.method} ${req.baseUrl}${req.path} (owner: ${owner})` });
