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

/**
 * Returns expired/cancelled cards updated within 1 hour that are not in dismissedIds.
 */
export function getRecentlyCancelledCards(
  cards: EventCardPayload[],
  dismissedIds: string[] | Set<string> | ReadonlySet<string>,
  now: number | Date = Date.now()
): EventCardPayload[] {
  const dismissedSet = Array.isArray(dismissedIds) ? new Set(dismissedIds) : dismissedIds;
  const nowMs = typeof now === "number" ? now : now.getTime();
  const ONE_HOUR_MS = 60 * 60 * 1000;

  return cards.filter((card) => {
    const isCancelledOrExpired = card.status === "expired" || (card.status as string) === "cancelled";
    if (!isCancelledOrExpired) return false;
    if (dismissedSet.has(card.id)) return false;

    const timeStr = card.updated_at ?? card.vote_closes_at ?? card.ends_at;
    if (!timeStr) return false;

    const cardMs = Date.parse(timeStr);
    if (isNaN(cardMs)) return false;

    const age = nowMs - cardMs;
    return age >= 0 && age <= ONE_HOUR_MS;
  });
}

