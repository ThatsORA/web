// Owner: Ojas — vote / Ghost Pass calls the event card makes. Both return 204;
// the card refetches GET /events/:id (or gets event:progress over the socket).
import { routes, VoteRequest } from "@web/contract";
import { useCallback } from "react";
import { z } from "zod";
import { api } from "../../lib/api";

const NoContent = z.unknown();

export const castVote = (eventId: string, optionId: string) =>
  api(routes.vote(eventId), NoContent, { method: "POST", body: VoteRequest.parse({ option_id: optionId }) });

export const ghostPass = (eventId: string) => api(routes.ghostPass(eventId), NoContent, { method: "POST" });

export const useVote = (eventId: string) => useCallback((optionId: string) => castVote(eventId, optionId), [eventId]);

export const useGhostPass = (eventId: string) => useCallback(() => ghostPass(eventId), [eventId]);
