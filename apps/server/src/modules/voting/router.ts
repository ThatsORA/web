// Owner: Ojas — votes + Ghost Pass (plan §9). Never expose who voted for what.
import { Router } from "express";
import { requireAuth } from "../../lib/auth";
import { notImplemented } from "../../lib/notImplemented";

export const votingRouter = Router();
votingRouter.post("/events/:id/vote", requireAuth, notImplemented("Ojas")); // VoteRequest
votingRouter.post("/events/:id/ghost-pass", requireAuth, notImplemented("Ojas"));
