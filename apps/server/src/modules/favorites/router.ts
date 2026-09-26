// Owner: Andy — quick-tap favorite categories.
import { Router } from "express";
import { routes } from "@web/contract";
import { requireAuth } from "../../lib/auth";
import { notImplemented } from "../../lib/notImplemented";

export const favoritesRouter = Router();
favoritesRouter.put(routes.favorites, requireAuth, notImplemented("Andy")); // PutFavoritesRequest
