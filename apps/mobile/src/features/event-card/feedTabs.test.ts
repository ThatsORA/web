import { describe, expect, it } from "vitest";
import { filterHangoutsByTab, getRecentlyCancelledCards, hasPendingNotification, pendingNotificationCount } from "./feedTabs";
import type { EventCardPayload } from "@web/contract";

const mockCard = (id: string, status: EventCardPayload["status"], my_status: EventCardPayload["my_status"]): Partial<EventCardPayload> => ({
  id,
  status,
  my_status,
});

describe("feedTabs", () => {
  const cards = [
    mockCard("c1", "voting", "invited"),
    mockCard("c2", "voting", "voted"),
    mockCard("c3", "confirmed", "confirmed"),
    mockCard("c4", "chatted", "confirmed"),
    mockCard("c5", "completed", "confirmed"),
    mockCard("c6", "expired", "ghost_passed"),
  ] as EventCardPayload[];

  it("filters cards into Pending tab (voting status)", () => {
    const pending = filterHangoutsByTab(cards, "pending");
    expect(pending.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("filters cards into Confirmed tab (confirmed or chatted status)", () => {
    const confirmed = filterHangoutsByTab(cards, "confirmed");
    expect(confirmed.map((c) => c.id)).toEqual(["c3", "c4"]);
  });

  it("filters cards into Past tab (completed or expired status)", () => {
    const past = filterHangoutsByTab(cards, "past");
    expect(past.map((c) => c.id)).toEqual(["c5", "c6"]);
  });

  it("detects when a notification badge is needed for unvoted pending hangouts", () => {
    expect(hasPendingNotification(cards)).toBe(true);
    expect(pendingNotificationCount(cards)).toBe(1);

    const noUnvotedCards = [
      mockCard("c2", "voting", "voted"),
      mockCard("c3", "confirmed", "confirmed"),
    ] as EventCardPayload[];

    expect(hasPendingNotification(noUnvotedCards)).toBe(false);
    expect(pendingNotificationCount(noUnvotedCards)).toBe(0);
  });

  describe("getRecentlyCancelledCards", () => {
    const baseTime = 1700000000000;

    const recentExpired = {
      id: "expired-recent",
      status: "expired",
      updated_at: new Date(baseTime - 30 * 60 * 1000).toISOString(), // 30 minutes ago
    } as EventCardPayload;

    const oldExpired = {
      id: "expired-old",
      status: "expired",
      updated_at: new Date(baseTime - 90 * 60 * 1000).toISOString(), // 90 minutes ago
    } as EventCardPayload;

    const votingCard = {
      id: "voting-1",
      status: "voting",
      updated_at: new Date(baseTime - 10 * 60 * 1000).toISOString(),
    } as EventCardPayload;

    it("returns expired/cancelled cards updated within 1 hour", () => {
      const result = getRecentlyCancelledCards([recentExpired, oldExpired, votingCard], [], baseTime);
      expect(result.map((c) => c.id)).toEqual(["expired-recent"]);
    });

    it("filters out cards in dismissedIds", () => {
      const result = getRecentlyCancelledCards([recentExpired], ["expired-recent"], baseTime);
      expect(result).toEqual([]);
    });

    it("handles Set for dismissedIds", () => {
      const dismissedSet = new Set(["expired-recent"]);
      const result = getRecentlyCancelledCards([recentExpired], dismissedSet, baseTime);
      expect(result).toEqual([]);
    });

    it("falls back to vote_closes_at or ends_at when updated_at is missing", () => {
      const cardFallback = {
        id: "expired-fallback",
        status: "expired",
        vote_closes_at: new Date(baseTime - 15 * 60 * 1000).toISOString(),
      } as EventCardPayload;

      const result = getRecentlyCancelledCards([cardFallback], [], baseTime);
      expect(result.map((c) => c.id)).toEqual(["expired-fallback"]);
    });
  });
});
