// Pure filtering and notification badge logic for the Hangouts feed sub-tabs.
import type { EventCardPayload } from "@web/contract";

export type HangoutTab = "pending" | "confirmed" | "past";

/** Filter event cards by feed sub-tab: Pending (voting), Confirmed (confirmed/chatted), Past (completed/expired). */
export function filterHangoutsByTab(cards: EventCardPayload[], tab: HangoutTab): EventCardPayload[] {
  return cards.filter((card) => {
    if (tab === "pending") {
      return card.status === "voting";
    }
    if (tab === "confirmed") {
      return card.status === "confirmed" || card.status === "chatted";
    }
    if (tab === "past") {
      return card.status === "completed" || card.status === "expired";
    }
    return true;
  });
}

/** True if there is at least one pending voting hangout where the caller hasn't voted yet. */
export function hasPendingNotification(cards: EventCardPayload[]): boolean {
  return cards.some((card) => card.status === "voting" && card.my_status === "invited");
}

/** Count of unvoted pending hangouts. */
export function pendingNotificationCount(cards: EventCardPayload[]): number {
  return cards.filter((card) => card.status === "voting" && card.my_status === "invited").length;
}
