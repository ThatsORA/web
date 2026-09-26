// Owner: Ojas — signup/login/profile. Plan: "API Contract v2".
import { Router } from "express";
import { routes } from "@web/contract";
import { requireAuth } from "../../lib/auth";
import { notImplemented } from "../../lib/notImplemented";

export const authRouter = Router();
authRouter.post(routes.signup, notImplemented("Ojas")); // SignupRequest → AuthResponse
authRouter.post(routes.login, notImplemented("Ojas")); // LoginRequest → AuthResponse
authRouter.get(routes.me, requireAuth, notImplemented("Ojas")); // → Me
authRouter.patch(routes.me, requireAuth, notImplemented("Ojas")); // PatchMeRequest → Me (round lat/lng to 3 dp)
