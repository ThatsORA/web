// Socket.io events. Payloads are deliberately thin: on any event the client
// refetches GET /events/:id, which is scoped to that viewer (#206). Never put
// a person, a vote or a pass in a payload.
import { z } from "zod";
import { EventStatus, Id } from "./schemas";

export const SocketEvents = {
  eventCreated: "event:created",
  eventProgress: "event:progress",
  eventResolved: "event:resolved",
  eventVenueChanged: "event:venue_changed",
  eventMessage: "event:message",
} as const;

export const EventCreatedPayload = z.object({ event_id: Id });
export const EventProgressPayload = z.object({
  event_id: Id,
  responded: z.number().int(),
  total: z.number().int(),
});
export const EventResolvedPayload = z.object({ event_id: Id, status: EventStatus });
export const EventVenueChangedPayload = z.object({ event_id: Id });
export const EventMessagePayload = z.object({ event_id: Id });

// Kept out of SocketEvents: clients subscribe to every SocketEvents name expecting { event_id }.
export const FriendSocketEvents = {
  friendRequest: "friend:request", // to the recipient; user_id = requester
  friendAccepted: "friend:accepted", // to the requester; user_id = who accepted
} as const;
export const FriendPayload = z.object({ user_id: Id });

export interface ServerToClientEvents {
  "event:created": (p: z.infer<typeof EventCreatedPayload>) => void;
  "event:progress": (p: z.infer<typeof EventProgressPayload>) => void;
  "event:resolved": (p: z.infer<typeof EventResolvedPayload>) => void;
  "event:venue_changed": (p: z.infer<typeof EventVenueChangedPayload>) => void;
  "event:message": (p: z.infer<typeof EventMessagePayload>) => void;
  "friend:request": (p: z.infer<typeof FriendPayload>) => void;
  "friend:accepted": (p: z.infer<typeof FriendPayload>) => void;
}

/** Room every authenticated socket joins. */
export const userRoom = (userId: string) => `user:${userId}`;
