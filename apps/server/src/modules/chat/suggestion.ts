// Owner: Ojas — reads what a chat message means and offers its sender one action (#325).
// Runs after the message is saved, off the request path. The suggestion goes only to the sender, and neither
// the classification nor the suggestion is stored, so other members never learn a message was classified.
import type { Event } from "@prisma/client";
import { ChatSocketEvents, type ChatSuggestionKind } from "@web/contract";
import { env } from "../../env";
import { emitToUsers } from "../../realtime";
import type { InvitedParticipant } from "../events/invitations";
import { askDecision, chatIntentRequest } from "../intelligence/decision";
import { changeSpot } from "../venues/swapToBackup";
import { votingOpen } from "../voting/resolution";

const ACT_AT = 0.75;

/**
 * The action to offer, or null. Acts only when the top intent is at least 0.75 and isn't `just_chatting` or
 * `logistics`: `cant_make_it` offers Pass while the sender can still pass, `change_spot` offers Change spot
 * while #214 allows it, and `running_late` is a hint with no action.
 */
export function chatSuggestion(
  probabilities: Record<string, number>,
  ctx: { canPass: boolean; canChangeSpot: boolean },
): { kind: ChatSuggestionKind } | null {
  const [top, p] = Object.entries(probabilities).reduce((best, e) => (e[1] > best[1] ? e : best), ["", 0]);
  if (p < ACT_AT) return null;
  if (top === "cant_make_it") return ctx.canPass ? { kind: "pass" } : null;
  if (top === "change_spot") return ctx.canChangeSpot ? { kind: "change_spot" } : null;
  if (top === "running_late") return { kind: "running_late_hint" };
  return null;
}

/** Classifies the saved message and emits `chat:suggestion` to its sender only. Never throws; a failure does nothing. */
export async function suggestToSender(
  event: Event,
  participants: readonly InvitedParticipant[],
  senderId: string,
  message: { id: string; body: string },
): Promise<void> {
  try {
    const { answers } = await askDecision(chatIntentRequest(message.body));
    const me = participants.find((p) => p.userId === senderId);
    const now = new Date();
    const suggestion = chatSuggestion(answers.intent!.probabilities, {
      // The pass endpoint's own check (voting open), minus a pass the sender already made.
      canPass: votingOpen(event, now) && me?.voteStatus !== "ghost_passed",
      // The change-spot route's check: a confirmed attendee, and changeSpot() would succeed right now.
      canChangeSpot: me?.voteStatus === "confirmed" && !!event.venuePlaceId &&
        changeSpot(event, event.venuePlaceId, now, env.REPORT_CLOSED_WINDOW_HOURS).ok,
    });
    if (suggestion) {
      emitToUsers([senderId], ChatSocketEvents.chatSuggestion, {
        event_id: event.id,
        message_id: message.id,
        kind: suggestion.kind,
      });
    }
  } catch (err) {
    // Log the error only, never the message text.
    console.error("chat intent failed:", err instanceof Error ? err.message : err);
  }
}
