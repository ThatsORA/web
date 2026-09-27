import { describe, expect, it } from "vitest";
import { FIXTURES } from "./fixtures";
import { mapsUrl, optionLabel, placeTitle, progressLabel, slotLabel, swapLabel, timeLabel } from "./format";

const card = FIXTURES[0]!.card;

describe("slotLabel", () => {
  it("renders the demo slot in the event's timezone", () => {
    expect(slotLabel(card)).toBe("Thu · 6:30–8:30pm · Dinner");
  });

  it("timeLabel is the headline without the vibe", () => {
    expect(timeLabel(card)).toBe("Thu · 6:30–8:30pm");
  });

  it("uses the event timezone, not UTC", () => {
    // 22:30Z is 6:30pm in New York but 3:30pm in Los Angeles.
    const utc = { ...card, starts_at: "2026-10-01T22:30:00Z", ends_at: "2026-10-02T00:30:00Z" };
    expect(slotLabel(utc)).toBe("Thu · 6:30–8:30pm · Dinner");
    expect(slotLabel({ ...utc, timezone: "America/Los_Angeles" })).toBe("Thu · 3:30–5:30pm · Dinner");
  });

  it("drops :00 and shows both periods when the slot crosses noon", () => {
    const brunch = {
      ...card,
      vibe_tag: "quick_coffee" as const,
      starts_at: "2026-10-03T11:00:00-04:00",
      ends_at: "2026-10-03T12:00:00-04:00",
    };
    expect(slotLabel(brunch)).toBe("Sat · 11am–12pm · Coffee");
  });
});

describe("labels", () => {
  it("progress counts responses, never who", () => {
    expect(progressLabel({ responded: 2, total: 3 })).toBe("2 of 3 responded");
  });

  it("swap banner names the new venue and its max travel", () => {
    expect(swapLabel({ name: "Sergio's", max_travel_min: 11 })).toBe("Swapped to Sergio's · max 11 min");
  });

  it("maps link points at the venue coordinates and place id", () => {
    expect(mapsUrl({ lat: 25.761, lng: -80.37, place_id: "abc 1" })).toBe(
      "https://www.google.com/maps/search/?api=1&query=25.761,-80.37&query_place_id=abc%201",
    );
  });
});

describe("option lines (#321)", () => {
  const timed = FIXTURES.find((f) => f.label === "Voting (activities, own times)")!.card;

  it("shows activity at place and the option's own time in the event's timezone", () => {
    expect(timed.options.map((o) => optionLabel(o, timed.timezone))).toEqual([
      "Bouldering at Movement · Thu 6:30pm",
      "Karaoke at Sing Sing · Fri 8pm",
      "Dinner at Latin House Grill · Sat 7pm",
    ]);
    expect(optionLabel(timed.options[0]!, "America/Los_Angeles")).toBe("Bouldering at Movement · Thu 3:30pm");
  });

  it("old options show just the place (the headline carries the event's time)", () => {
    expect(optionLabel(card.options[1]!, card.timezone)).toBe("Sergio's");
    expect(placeTitle(card.options[1]!)).toBe("Sergio's");
  });

  it("the confirmed card's event time is the winner's time", () => {
    const confirmed = FIXTURES.find((f) => f.label === "Confirmed (activity winner)")!.card;
    expect(placeTitle(confirmed.outcome!.venue!)).toBe("Karaoke at Sing Sing");
    expect(timeLabel(confirmed)).toBe("Fri · 8–10pm");
  });
});
