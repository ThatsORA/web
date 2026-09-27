// Pure filtering and notification badge logic for the Hangouts feed sub-tabs.
import type { EventCardPayload } from "@web/contract";

export type HangoutTab = "pending" | "confirmed" | "past";

/** Filter event cards by feed sub-tab: Pending (voting/invited), Confirmed (confirmed/chatted), Past (completed/expired). */
export function filterHangoutsByTab(cards: EventCardPayload[], tab: HangoutTab): EventCardPayload[] {
  return cards.filter((card) => {
    if (tab === "pending") {
      return (
        card.status === "voting" ||
        (card.my_status === "invited" &&
          card.status !== "completed" &&
          card.status !== "expired")
      );
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

/** Whether this card represents an active hangout with a pending invite awaiting response before its start time. */
export function isPendingInvite(card: EventCardPayload, now = Date.now()): boolean {
  if (card.my_status !== "invited") return false;
  if (card.status === "completed" || card.status === "expired") return false;
  if (card.starts_at && Date.parse(card.starts_at) <= now) return false;
  return true;
}

/** True if there is at least one active hangout where the caller has a pending invite before its start time. */
export function hasPendingNotification(cards: EventCardPayload[], now = Date.now()): boolean {
  return cards.some((card) => isPendingInvite(card, now));
}

/** Count of active hangouts with pending invites before start time. */
export function pendingNotificationCount(cards: EventCardPayload[], now = Date.now()): number {
  return cards.filter((card) => isPendingInvite(card, now)).length;
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

