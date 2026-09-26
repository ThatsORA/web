// Owner: Riley — "It's closed" (plan §11). Places/Routes calls live in this
// module too; wrap every external call in withFixture().
import { Router } from "express";
import { requireAuth } from "../../lib/auth";
import { notImplemented } from "../../lib/notImplemented";

export const venuesRouter = Router();
venuesRouter.post("/events/:id/report-closed", requireAuth, notImplemented("Riley")); // ReportClosedRequest; 409 if venue already swapped
