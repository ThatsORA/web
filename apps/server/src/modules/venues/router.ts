// Owner: Riley — "It's closed" (plan §11). Places/Routes calls live in this
// module too; wrap every external call in withFixture().
import { Router, type Request, type Response } from "express";
import { ChangeSpotRequest, Id, ReportClosedRequest, routes } from "@web/contract";
import { env } from "../../env";
import { requireAuth, type AuthedRequest } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { emitToUsers, pushVenueChanged } from "../../realtime";
import { assembleEventCard } from "../events/assembleEventCard";
import { changeSpot, swapToBackup } from "./swapToBackup";

export const venuesRouter = Router();

async function currentEventCard(eventId: string, userId: string) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, participants: { some: { userId } } },
    include: {
      participants: { include: { user: { select: { id: true, username: true } } } },
      options: true,
      votes: { select: { userId: true, optionId: true } },
    },
  });
  return event ? assembleEventCard(event, userId) : null;
}

async function handleVenueSwap(req: Request, res: Response, intent: "report_closed" | "change_spot") {
  const id = Id.safeParse(req.params.id);
  if (!id.success) return res.status(404).json({ error: "not_found" });
  const body = (intent === "change_spot" ? ChangeSpotRequest : ReportClosedRequest).safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: intent === "change_spot" ? "invalid_change_spot" : "invalid_report_closed" });
  }
  const userId = (req as AuthedRequest).userId;
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: id.data },
      include: { participants: { select: { userId: true, voteStatus: true } } },
    });
    if (!event) return { kind: "not_found" as const };
    const caller = event.participants.find((participant) => participant.userId === userId);
    if (!caller || (intent === "change_spot" && caller.voteStatus !== "confirmed")) {
      return { kind: "forbidden" as const };
    }

    const decision = intent === "change_spot"
      ? changeSpot(event, body.data.current_place_id, now, env.REPORT_CLOSED_WINDOW_HOURS)
      : swapToBackup(event, body.data.current_place_id, now, env.REPORT_CLOSED_WINDOW_HOURS);
    if (!decision.ok) return { kind: "rejected" as const, decision };

    const { count } = await tx.event.updateMany({
      where: {
        id: id.data,
        status: "confirmed",
        venuePlaceId: body.data.current_place_id,
      },
      data: decision.data,
    });
    if (!count) return { kind: "race" as const };
    return {
      kind: "updated" as const,
      transition: decision.kind,
      participantIds: event.participants
        .filter((participant) => intent === "report_closed" || participant.voteStatus === "confirmed")
        .map((participant) => participant.userId),
    };
  });

  if (result.kind === "not_found") return res.status(404).json({ error: "not_found" });
  if (result.kind === "forbidden") return res.status(403).json({ error: "not_a_participant" });
  if (result.kind === "race" ||
    (result.kind === "rejected" && result.decision.error === "venue_already_changed")) {
    return res.status(409).json({
      error: "venue_already_changed",
      event: await currentEventCard(id.data, userId),
    });
  }
  if (result.kind === "rejected") {
    return res.status(result.decision.status).json({ error: result.decision.error });
  }

  pushVenueChanged(result.participantIds, id.data).catch((err) => {
    console.error("pushVenueChanged failed:", err);
  });
  emitToUsers(result.participantIds, "event:venue_changed", { event_id: id.data });
  return res.json({ ok: true, status: result.transition });
}

venuesRouter.post(routes.reportClosed(":id"), requireAuth, (req, res) => handleVenueSwap(req, res, "report_closed"));
venuesRouter.post(routes.changeSpot(":id"), requireAuth, (req, res) => handleVenueSwap(req, res, "change_spot"));
