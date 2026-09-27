// Owner: Ojas — API helpers for fallback group chat on chatted events.
import {
  ChatMessage,
  ChatMessagesResponse,
  EventCardPayload,
  routes,
  SendChatMessageRequest,
  type ChatSuggestionKind,
} from "@web/contract";
import { z } from "zod";
import { api } from "../../lib/api";
import { changeSpotNotice, requestChangeSpot } from "../event-card/changeSpot";

/** The chip under the sender's own message (#325). Only the sender ever gets a suggestion. */
export const SUGGESTION_LABEL: Record<ChatSuggestionKind, string> = {
  pass: "Pass on this one?",
  change_spot: "Suggest a different spot?",
  running_late_hint: "Let them know you're running late?",
};

// The contract defines no response body for ghost-pass; the card refetches on its socket event.
const Ignored = z.unknown();

/**
 * Runs the chip's action through the existing endpoints, which enforce #210's pass rules and #214's
 * change-spot rules. Change spot sends the card's current venue, like the card's own button. Returns an
 * error notice, or undefined. The running-late hint has no action.
 */
export async function runSuggestion(eventId: string, kind: ChatSuggestionKind): Promise<string | undefined> {
  try {
    if (kind === "pass") await api(routes.ghostPass(eventId), Ignored, { method: "POST" });
    if (kind === "change_spot") await requestChangeSpot(await api(routes.event(eventId), EventCardPayload));
    return undefined;
  } catch (e) {
    return kind === "change_spot" ? changeSpotNotice(e) : "Couldn't pass. Try again from the card.";
  }
}

export async function getEventMessages(
  eventId: string,
  before?: string
): Promise<ChatMessagesResponse> {
  const query = before ? `?before=${encodeURIComponent(before)}` : "";
  const path = `${routes.eventMessages(eventId)}${query}`;
  return api(path, ChatMessagesResponse);
}

export async function sendChatMessage(
  eventId: string,
  body: string
): Promise<ChatMessage> {
  const payload = SendChatMessageRequest.parse({ body });
  return api(routes.eventMessages(eventId), ChatMessage, {
    method: "POST",
    body: payload,
  });
}
