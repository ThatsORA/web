// Owner: Andy — quick-tap favorite categories.
import { Router } from "express";
import { GetFavoritesResponse, PutFavoritesRequest, routes } from "@web/contract";
import { requireAuth, type AuthedRequest } from "../../lib/auth";
import { prisma } from "../../lib/prisma";

export const favoritesRouter = Router();

/** Returns the caller's favorite categories `{ categories: string[] }`. */
favoritesRouter.get(routes.favorites, requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const rows = await prisma.userFavorite.findMany({
    where: { userId },
    select: { category: true },
  });
  return res.json(GetFavoritesResponse.parse({ categories: rows.map((r) => r.category) }));
});

/** Replaces the caller's favorite categories. Replies `{ categories }` (deduped, tap order kept). */
favoritesRouter.put(routes.favorites, requireAuth, async (req, res) => {
  const parsed = PutFavoritesRequest.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body", message: parsed.error.message });
  const userId = (req as AuthedRequest).userId;
  const categories = [...new Set(parsed.data.categories)];
  await prisma.$transaction(async (tx) => {
    await tx.userFavorite.deleteMany({ where: { userId } });
    if (categories.length) await tx.userFavorite.createMany({ data: categories.map((category) => ({ userId, category })) });
  });
  return res.json({ categories });
});
