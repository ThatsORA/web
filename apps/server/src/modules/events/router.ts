// Owner: Andy — event list + EventCardPayload assembly.
// Payload must never include other people's votes; tallies only after close.
import { Router } from "express";
import { routes } from "@web/contract";
import { requireAuth } from "../../lib/auth";
import { notImplemented } from "../../lib/notImplemented";

export const eventsRouter = Router();
eventsRouter.get(routes.events, requireAuth, notImplemented("Andy")); // → EventsListResponse
eventsRouter.get("/events/:id", requireAuth, notImplemented("Andy")); // → EventCardPayload
