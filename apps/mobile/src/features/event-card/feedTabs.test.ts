import { describe, expect, it } from "vitest";
import { filterHangoutsByTab, getPendingInviteIds, getRecentlyCancelledCards, hasPendingNotification, pendingNotificationCount } from "./feedTabs";
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

  it("filters cards into Pending tab (voting status or pending late invites)", () => {
    const pending = filterHangoutsByTab(cards, "pending");
    expect(pending.map((c) => c.id)).toEqual(["c1", "c2"]);

    const lateInvite = mockCard("c7", "confirmed", "invited") as EventCardPayload;
    const withLate = filterHangoutsByTab([...cards, lateInvite], "pending");
    expect(withLate.map((c) => c.id)).toEqual(["c1", "c2", "c7"]);

    const pastInvite = { ...mockCard("c8", "completed", "invited") } as EventCardPayload;
    const expiredInvite = { ...mockCard("c9", "expired", "invited") } as EventCardPayload;
    expect(filterHangoutsByTab([pastInvite, expiredInvite], "pending")).toEqual([]);
  });

  it("filters cards into Confirmed tab (confirmed or chatted status)", () => {
    const confirmed = filterHangoutsByTab(cards, "confirmed");
    expect(confirmed.map((c) => c.id)).toEqual(["c3", "c4"]);

    const lateInvite = mockCard("c7", "confirmed", "invited") as EventCardPayload;
    const withLate = filterHangoutsByTab([...cards, lateInvite], "confirmed");
    expect(withLate.map((c) => c.id)).toEqual(["c3", "c4", "c7"]);
  });

  it("filters cards into Past tab (completed or expired status)", () => {
    const past = filterHangoutsByTab(cards, "past");
    expect(past.map((c) => c.id)).toEqual(["c5", "c6"]);
  });

  it("excludes dismissed expired cards from Past tab when dismissedIds is provided", () => {
    // c6 is expired status in mockCard setup
    const pastWithDismissedArray = filterHangoutsByTab(cards, "past", ["c6"]);
    expect(pastWithDismissedArray.map((c) => c.id)).toEqual(["c5"]);

    const pastWithDismissedSet = filterHangoutsByTab(cards, "past", new Set(["c6"]));
    expect(pastWithDismissedSet.map((c) => c.id)).toEqual(["c5"]);

    const pastAllDismissed = filterHangoutsByTab(cards, "past", ["c5", "c6"]);
    expect(pastAllDismissed).toEqual([]);
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

  it("dismisses notification dot for seen pending hangouts and reappears on new invites", () => {
    expect(getPendingInviteIds(cards)).toEqual(["c1"]);
    expect(hasPendingNotification(cards)).toBe(true);

    expect(hasPendingNotification(cards, ["c1"])).toBe(false);
    expect(pendingNotificationCount(cards, ["c1"])).toBe(0);

    const withNewCard = [
      ...cards,
      mockCard("c-new", "voting", "invited") as EventCardPayload,
    ];
    expect(getPendingInviteIds(withNewCard)).toEqual(["c1", "c-new"]);
    expect(hasPendingNotification(withNewCard, ["c1"])).toBe(true);
    expect(pendingNotificationCount(withNewCard, ["c1"])).toBe(1);

    expect(hasPendingNotification(withNewCard, ["c1", "c-new"])).toBe(false);
    expect(pendingNotificationCount(withNewCard, ["c1", "c-new"])).toBe(0);

    expect(hasPendingNotification(withNewCard, new Set(["c1", "c-new"]))).toBe(false);
  });

  it("includes active late invites before start time in notification count", () => {
    const now = 1700000000000;
    const futureConfirmed = {
      ...mockCard("c-future", "confirmed", "invited"),
      starts_at: new Date(now + 3600000).toISOString(),
    } as EventCardPayload;
    const pastConfirmed = {
      ...mockCard("c-past", "confirmed", "invited"),
      starts_at: new Date(now - 3600000).toISOString(),
    } as EventCardPayload;
    const completedInvite = {
      ...mockCard("c-completed", "completed", "invited"),
      starts_at: new Date(now + 3600000).toISOString(),
    } as EventCardPayload;

    expect(hasPendingNotification([futureConfirmed], now)).toBe(true);
    expect(pendingNotificationCount([futureConfirmed], now)).toBe(1);

    expect(hasPendingNotification([pastConfirmed], now)).toBe(false);
    expect(pendingNotificationCount([pastConfirmed], now)).toBe(0);

    expect(hasPendingNotification([completedInvite], now)).toBe(false);
    expect(pendingNotificationCount([completedInvite], now)).toBe(0);
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
