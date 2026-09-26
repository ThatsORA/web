// Socket.io events. Payloads are deliberately thin: on any event the client
// refetches GET /events/:id. Never put vote identities in a payload.
import { z } from "zod";
import { EventStatus, Id } from "./schemas";

export const SocketEvents = {
  eventCreated: "event:created",
  eventProgress: "event:progress",
  eventResolved: "event:resolved",
  eventVenueChanged: "event:venue_changed",
} as const;

export const EventCreatedPayload = z.object({ event_id: Id });
export const EventProgressPayload = z.object({
  event_id: Id,
  responded: z.number().int(),
  total: z.number().int(),
});
export const EventResolvedPayload = z.object({ event_id: Id, status: EventStatus });
export const EventVenueChangedPayload = z.object({ event_id: Id });

export interface ServerToClientEvents {
  "event:created": (p: z.infer<typeof EventCreatedPayload>) => void;
  "event:progress": (p: z.infer<typeof EventProgressPayload>) => void;
  "event:resolved": (p: z.infer<typeof EventResolvedPayload>) => void;
  "event:venue_changed": (p: z.infer<typeof EventVenueChangedPayload>) => void;
}

/** Room every authenticated socket joins. */
export const userRoom = (userId: string) => `user:${userId}`;
