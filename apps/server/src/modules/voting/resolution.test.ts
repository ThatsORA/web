import { describe, expect, it } from "vitest";
import type { EventOption, VoteStatus } from "@web/contract";
import { progress, resolveEvent, voteClosesAt, votingOpen } from "./resolution";

const opt = (id: string, rank: number, route_score: number) =>
  ({
    id, rank, route_score, place_id: `p-${id}`, name: id, lat: 0, lng: 0, primary_type: null, price_level: null,
    rating: null, user_rating_count: null, travel_minutes: {}, max_travel_min: 10, facts_line: "", ai_blurb: null,
  }) satisfies EventOption & { id: string };
const A = opt("a", 1, 20);
const B = opt("b", 2, 15);
const C = opt("c", 3, 30);
const options = [A, B, C];
const unused: EventOption[] = [{ ...opt("d", 4, 40), id: undefined }];
const people = (...statuses: VoteStatus[]) => statuses.map((voteStatus, i) => ({ userId: `u${i}`, voteStatus }));

describe("voteClosesAt", () => {
  const opened = new Date("2026-09-26T12:00:00Z");
  it("uses the timeout when the slot is far away", () => {
    expect(voteClosesAt(opened, new Date("2026-10-01T18:00:00Z"), 90)).toEqual(new Date("2026-09-26T12:01:30Z"));
  });
  it("caps at 2 h before the slot when created < 24 h in advance", () => {
    expect(voteClosesAt(opened, new Date("2026-09-26T20:00:00Z"), 43200)).toEqual(new Date("2026-09-26T18:00:00Z"));
  });
  it("caps at 24 h before the slot when created >= 24 h in advance", () => {
    expect(voteClosesAt(opened, new Date("2026-09-28T18:00:00Z"), 172800)).toEqual(new Date("2026-09-27T18:00:00Z"));
  });
});

describe("votingOpen", () => {
  const now = new Date("2026-09-26T12:00:00Z");
  const later = new Date("2026-09-26T12:01:00Z");
  it("is open only while voting and before the deadline", () => {
    expect(votingOpen({ status: "voting", voteClosesAt: later }, now)).toBe(true);
    expect(votingOpen({ status: "voting", voteClosesAt: now }, now)).toBe(false); // the sweep hasn't run yet
    expect(votingOpen({ status: "confirmed", voteClosesAt: later }, now)).toBe(false); // closed early
  });
});

describe("progress", () => {
  it("counts a ghost pass as responded", () => {
    expect(progress(["invited", "voted", "ghost_passed"])).toEqual({ responded: 2, total: 3 });
  });
});

describe("resolveEvent", () => {
  it("expires when fewer than 2 remain after ghost passes", () => {
    const r = resolveEvent({ participants: people("voted", "ghost_passed", "ghost_passed"), votes: [{ userId: "u0", optionId: "a" }], options, unusedVenues: unused });
    expect(r).toEqual({ status: "expired" });
  });

  it("chats when 2+ remain but fewer than 2 votes", () => {
    const r = resolveEvent({ participants: people("voted", "invited", "ghost_passed"), votes: [{ userId: "u0", optionId: "a" }], options, unusedVenues: unused });
    expect(r).toEqual({ status: "chatted" });
  });

  it("ignores a stale vote from someone who ghost-passed", () => {
    const r = resolveEvent({
      participants: people("voted", "invited", "ghost_passed"),
      votes: [{ userId: "u0", optionId: "a" }, { userId: "u2", optionId: "a" }],
      options, unusedVenues: unused,
    });
    expect(r.status).toBe("chatted");
  });

  it("confirms the plurality winner; backups = losers by votes then route_score, then unused venues", () => {
    const r = resolveEvent({
      participants: people("voted", "voted", "voted", "invited"),
      votes: [{ userId: "u0", optionId: "c" }, { userId: "u1", optionId: "c" }, { userId: "u2", optionId: "a" }],
      options, unusedVenues: unused,
    });
    if (r.status !== "confirmed") throw new Error(r.status);
    expect(r.winner.id).toBe("c");
    expect(r.backups.map((o) => o.name)).toEqual(["a", "b", "d"]);
  });

  it("breaks a tie with the lower route_score", () => {
    const r = resolveEvent({
      participants: people("voted", "voted"),
      votes: [{ userId: "u0", optionId: "a" }, { userId: "u1", optionId: "b" }],
      options, unusedVenues: [],
    });
    if (r.status !== "confirmed") throw new Error(r.status);
    expect(r.winner.id).toBe("b");
    expect(r.backups.map((o) => o.name)).toEqual(["a", "c"]);
  });
});
