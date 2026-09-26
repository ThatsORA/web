// Owner: Riley — replace the caller's busy blocks inside [horizon_start, horizon_end]
// in one transaction, then triggerMatcher().
import { Router } from "express";
import { routes } from "@web/contract";
import { requireAuth } from "../../lib/auth";
import { notImplemented } from "../../lib/notImplemented";

export const calendarRouter = Router();
calendarRouter.put(routes.busyBlocks, requireAuth, notImplemented("Riley")); // PutBusyBlocksRequest → PutBusyBlocksResponse
