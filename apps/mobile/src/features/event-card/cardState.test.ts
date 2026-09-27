import { EventCardPayload } from "@web/contract";
import { describe, expect, it } from "vitest";
import { byStart, canChangeSpot, canAnswerInvite, canInvite, inviteSearch, canOpenChat, cardKind, detectSwap, freePeople, hasEnded, isSquadHangout, passButtonLabel, passedNotice, participantBreakdown, travelRows, votingTimeRemaining } from "./cardState";
import { FIXTURES, ME } from "./fixtures";

const get = (label: string) => FIXTURES.find((f) => f.label === label)!.card;

describe("fixtures", () => {
  it("every stub parses as a contract EventCardPayload", () => {
    for (const f of FIXTURES) expect(() => EventCardPayload.parse(f.card), f.label).not.toThrow();
  });
});

describe("cardKind", () => {
  it("maps each fixture to its state", () => {
    expect(FIXTURES.map((f) => [f.label, cardKind(f.card)])).toEqual([
      ["Voting", "voting"],
      ["Waiting (voted)", "waiting"],
      ["Waiting (ghost passed)", "waiting"],
      ["Voting (with match reason)", "voting"],
      ["Confirmed", "confirmed"],
      ["Confirmed (with match reason)", "confirmed"],
      ["Swapped", "confirmed"],
      ["Chatted", "chatted"],
      ["Expired", "expired"],
      ["Completed (ended event)", "completed"],
      ["Voting (activities, own times)", "voting"],
      ["Confirmed (activity winner)", "confirmed"],
    ]);
  });

  it("treats a ghost pass exactly like a vote while voting is open", () => {
    expect(cardKind({ status: "voting", my_status: "ghost_passed" })).toBe(cardKind({ status: "voting", my_status: "voted" }));
  });

  it("passes completed through", () => {
    expect(cardKind({ status: "completed", my_status: "confirmed" })).toBe("completed");
  });
});

describe("detectSwap", () => {
  const confirmed = get("Confirmed");
  const swapped = get("Swapped");

  it("fires when a confirmed venue changes", () => {
    expect(detectSwap(confirmed, swapped)).toBe(true);
  });

  it("does not fire on first load, on an unchanged venue, or on the voting → confirmed flip", () => {
    expect(detectSwap(undefined, swapped)).toBe(false);
    expect(detectSwap(confirmed, confirmed)).toBe(false);
    expect(detectSwap(get("Voting"), confirmed)).toBe(false);
  });

  it("does not fire when the last backup ran out and the event became chatted", () => {
    expect(detectSwap(confirmed, get("Chatted"))).toBe(false);
  });
});

describe("travelRows", () => {
  it("lists each attendee's minutes to the venue", () => {
    expect(travelRows(get("Confirmed"))).toEqual([
      { id: ME.id, username: "presenter", display_name: "presenter", minutes: 9 },
      { id: expect.any(String), username: "riley", display_name: "riley", minutes: 14 },
    ]);
  });

  it("is empty with no venue", () => {
    expect(travelRows(get("Voting"))).toEqual([]);
    expect(travelRows(get("Chatted"))).toEqual([]);
  });
});

describe("helpers", () => {
  it("offers Change spot only on a confirmed event with a venue", () => {
    expect(FIXTURES.filter((f) => canChangeSpot(f.card)).map((f) => f.label)).toEqual(["Confirmed", "Confirmed (with match reason)", "Swapped", "Confirmed (activity winner)"]);
  });

  it("hides Change spot from people who didn't vote for the plan (the server would refuse them)", () => {
    expect(canChangeSpot({ ...get("Confirmed"), my_status: "ghost_passed" })).toBe(false);
    expect(canChangeSpot({ ...get("Confirmed"), my_status: "invited" })).toBe(false);
  });

  it("chatted lists the attendees as free, falling back to participants", () => {
    expect(freePeople(get("Chatted")).map((p) => p.username)).toEqual(["presenter", "riley", "ojas"]);
    expect(freePeople(get("Voting")).length).toBe(3);
  });

  it("an event has ended from its ends_at onwards (chat goes read-only)", () => {
    const card = { ends_at: "2026-10-01T20:30:00-04:00" };
    expect(hasEnded(card, Date.parse("2026-10-01T20:29:59-04:00"))).toBe(false);
    expect(hasEnded(card, Date.parse("2026-10-01T20:30:00-04:00"))).toBe(true);
  });

  it("sorts soonest first", () => {
    const later = { ...get("Voting"), starts_at: "2026-10-02T18:30:00-04:00" };
    expect([later, get("Voting")].sort(byStart)[0]!.starts_at).toBe("2026-10-01T18:30:00-04:00");
  });

  it("passButtonLabel returns Ghost Pass for direct invitees and Pass (can't make it) for squad invitees", () => {
    expect(passButtonLabel({ invite_source: "direct", pass_kind: "ghost", full_roster: false, chat: null })).toBe("Ghost Pass");
    expect(passButtonLabel({ invite_source: "squad", pass_kind: "visible", full_roster: false, chat: "open" })).toBe("Pass (can't make it)");
  });

  it("passedNotice returns quiet explanation for direct invitees and can't make it for squad invitees", () => {
    expect(passedNotice({ invite_source: "direct", pass_kind: "ghost", full_roster: false, chat: null })).toBe(
      "You passed quietly. Nobody else can tell."
    );
    expect(passedNotice({ invite_source: "squad", pass_kind: "visible", full_roster: false, chat: "open" })).toBe(
      "You passed (can't make it)."
    );
  });

  it("canOpenChat checks if viewer has chat access (open or read_only)", () => {
    expect(canOpenChat({ viewer: { invite_source: "squad", pass_kind: "visible", full_roster: false, chat: "open" } })).toBe(true);
    expect(canOpenChat({ viewer: { invite_source: "squad", pass_kind: "visible", full_roster: false, chat: "read_only" } })).toBe(true);
    expect(canOpenChat({ viewer: { invite_source: "direct", pass_kind: "ghost", full_roster: false, chat: null } })).toBe(false);
    expect(canOpenChat({ viewer: null })).toBe(false);
  });

  it("isSquadHangout identifies when invite_source is squad", () => {
    expect(isSquadHangout({ viewer: { invite_source: "squad" } })).toBe(true);
    expect(isSquadHangout({ viewer: { invite_source: "direct" } })).toBe(false);
    expect(isSquadHangout({ viewer: { invite_source: "creator" } })).toBe(false);
    expect(isSquadHangout({ viewer: null })).toBe(false);
    expect(isSquadHangout({})).toBe(false);
  });

  it("allows squad members to open chat during voting and confirmation on squad hangouts", () => {
    expect(canOpenChat(get("Voting"))).toBe(true);
    expect(canOpenChat(get("Confirmed"))).toBe(true);
  });

  it("allows confirmed attendees to open chat on confirmed events across all event types", () => {
    expect(canOpenChat({ viewer: { invite_source: "direct", pass_kind: "ghost", full_roster: false, chat: "open" } })).toBe(true);
    expect(canOpenChat({ viewer: { invite_source: "creator", pass_kind: "visible", full_roster: true, chat: "open" } })).toBe(true);
    expect(canOpenChat({ viewer: { invite_source: "direct", pass_kind: "ghost", full_roster: false, chat: "read_only" } })).toBe(true);
  });

  it("votingTimeRemaining formats remaining time correctly", () => {
    const now = 1000000;
    expect(votingTimeRemaining(new Date(now + 120000).toISOString(), now)).toBe("2m remaining");
    expect(votingTimeRemaining(new Date(now + 7200000).toISOString(), now)).toBe("2h remaining");
    expect(votingTimeRemaining(new Date(now - 1000).toISOString(), now)).toBe("Voting ending…");
  });

  it("participantBreakdown categorizes participants accurately", () => {
    const card = get("Chatted");
    const breakdown = participantBreakdown(card);
    expect(breakdown.responded.map((p) => p.username)).toEqual(["presenter", "riley", "ojas"]);
    expect(breakdown.passed).toEqual([]);
  });
});

describe("late invites (#345, #384)", () => {
  const confirmed = get("Confirmed");
  const before = Date.parse(confirmed.starts_at) - 60_000;
  const after = Date.parse(confirmed.starts_at) + 60_000;

  it("offers Invite friends only once confirmed with a venue until the start, not during voting, after a pass, or on a Mixer", () => {
    expect(canInvite(get("Voting"), before)).toBe(false);
    expect(canInvite(confirmed, before)).toBe(true);
    expect(canInvite({ ...confirmed, outcome: null }, before)).toBe(false);
    expect(canInvite(confirmed, after)).toBe(false);
    expect(canInvite(get("Waiting (ghost passed)"), before)).toBe(false);
    expect(canInvite({ ...confirmed, is_mixer: true }, before)).toBe(false);
    expect(canInvite(get("Chatted"), before)).toBe(false);
  });

  it("offers I'm in / Can't make it only to a direct invitee who hasn't answered a confirmed hangout", () => {
    const lateInvite = { ...confirmed, my_status: "invited" as const, viewer: { ...confirmed.viewer, invite_source: "direct" as const } };
    expect(canAnswerInvite(lateInvite, before)).toBe(true);
    expect(canAnswerInvite(lateInvite, after)).toBe(false);
    expect(canAnswerInvite({ ...lateInvite, my_status: "confirmed" }, before)).toBe(false);
    expect(canAnswerInvite({ ...lateInvite, viewer: { ...lateInvite.viewer, invite_source: "squad" } }, before)).toBe(false);
    expect(canAnswerInvite({ ...lateInvite, status: "voting" }, before)).toBe(false);
  });

  it("shows nobody until you search, then marks people already in the group", () => {
    const card = get("Voting");
    const inGroup = card.participants.find((p) => p.id !== ME.id)!;
    const newbie = { id: "00000000-0000-4000-8000-0000000000ff", username: "newbie", display_name: "Nadia Q" };
    const friends = [inGroup, newbie];
    const memberIds = card.participants.map((p) => p.id);
    expect(inviteSearch(friends, memberIds, "")).toEqual([]);
    expect(inviteSearch(friends, memberIds, "   ")).toEqual([]);
    expect(inviteSearch(friends, memberIds, "  NADIA ")).toEqual([{ friend: newbie, inGroup: false }]);
    expect(inviteSearch(friends, memberIds, inGroup.username.slice(0, 3))).toEqual([{ friend: inGroup, inGroup: true }]);
    // Squads pass their member ids the same way (#359).
    expect(inviteSearch(friends, [newbie.id], "nadia")).toEqual([{ friend: newbie, inGroup: true }]);
  });
});
