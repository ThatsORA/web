import { routes } from "@web/contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCardAction } from "./cardAction";
import { changeSpotNotice, changeSpotPrompt, nextBackup, requestChangeSpot } from "./changeSpot";
import { FIXTURES } from "./fixtures";

const get = (label: string) => FIXTURES.find((f) => f.label === label)!.card;
const confirmed = get("Confirmed"); // at Latin House Grill (2 votes); Sergio's and Pollo Tropical got 0

describe("nextBackup", () => {
  it("follows the server's backup order: most votes, then lower route_score", () => {
    // Pollo Tropical (route 11.2) beats Sergio's (13.8) on the 0-0 tie.
    expect(nextBackup(confirmed)?.name).toBe("Pollo Tropical");
    const sergiosVoted = { ...confirmed, outcome: { ...confirmed.outcome!, tallies: { ...confirmed.outcome!.tallies!, [confirmed.options[1]!.id!]: 1 } } };
    expect(nextBackup(sergiosVoted)?.name).toBe("Sergio's");
  });

  it("is unknown once the current spot is the last vote option", () => {
    const atSergios = { ...confirmed, outcome: { ...confirmed.outcome!, venue: confirmed.options[1]! } }; // last: Latin, Pollo, Sergio's
    expect(nextBackup(atSergios)).toBeNull();
  });
});

describe("Change spot flow", () => {
  const fetchMock = vi.fn();
  const refetch = vi.fn(async () => {});
  const respond = (status: number, body: unknown) =>
    fetchMock.mockResolvedValueOnce({ ok: status < 300, status, json: async () => body });
  // What the hook runs when the attendee taps "Change for everyone".
  const confirmChange = (card = confirmed) => runCardAction(() => requestChangeSpot(card), refetch, changeSpotNotice);

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    refetch.mockClear();
  });

  it("names the next backup before asking to change it for everyone", () => {
    expect(changeSpotPrompt(confirmed)).toEqual({
      title: "Change spot for everyone?",
      body: "Next backup: Pollo Tropical · max 9 min. Everyone's plan and calendar move there.",
    });
  });

  it("still asks, without a name, when the card can't tell the next backup", () => {
    const atSergios = { ...confirmed, outcome: { ...confirmed.outcome!, venue: confirmed.options[1]! } }; // last: Latin, Pollo, Sergio's
    expect(changeSpotPrompt(atSergios).body).toBe("Everyone moves to the next backup spot. Their plans and calendars update too.");
  });

  it("posts the spot we're looking at to #214's route, then refetches the card", async () => {
    respond(200, { ok: true, status: "swapped" });
    expect(await confirmChange()).toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(new RegExp(`/api/v1${routes.changeSpot(confirmed.id)}$`));
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ current_place_id: "stub_place_1" });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("says someone else already changed it, and refetches to show the new spot", async () => {
    respond(409, { error: "venue_already_changed", event: null });
    expect(await confirmChange()).toBe("Someone already changed the spot. Here's the new one.");
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("says there's no backup left, and refetches", async () => {
    respond(409, { error: "no_backup_venue" });
    expect(await confirmChange()).toBe("No backup spots left, so the plan stays here.");
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to a plain retry message for anything else", async () => {
    respond(500, {});
    expect(await confirmChange()).toBe("Couldn't change the spot. Try again.");
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    expect(await confirmChange()).toBe("Couldn't change the spot. Try again.");
    expect(refetch).toHaveBeenCalledTimes(2);
  });
});
