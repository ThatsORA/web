// Owner: Ojas — API helpers for fallback group chat on chatted events.
import {
  ChatMessage,
  ChatMessagesResponse,
  routes,
  SendChatMessageRequest,
} from "@web/contract";
import { api } from "../../lib/api";

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
