import { describe, expect, it } from "vitest";
import { filterHangoutsByTab, hasPendingNotification, pendingNotificationCount } from "./feedTabs";
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
});
