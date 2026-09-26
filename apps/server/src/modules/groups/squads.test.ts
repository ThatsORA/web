import { describe, expect, it } from "vitest";
import { OBJECTION_WINDOW_MS, hasRoom, isDue, onAccept, visibleJoinsAt, type Membership } from "./squads";

const invitedAt = new Date("2026-09-26T12:00:00Z");
const later = (ms: number) => new Date(invitedAt.getTime() + ms);
const invite = (acceptedAt: Date | null = null): Membership => ({ status: "invited", invitedAt, acceptedAt });

describe("squad consent", () => {
  it("small squads (1–2 active): accepting makes you active straight away", () => {
    expect(onAccept(invite(), 1, later(1000))).toBe("active");
    expect(onAccept(invite(), 2, later(1000))).toBe("active");
  });

  it("3+ active: an accepted invite waits out the 24 h objection window", () => {
    expect(onAccept(invite(), 3, later(1000))).toBe("waiting");
    expect(onAccept(invite(), 3, later(OBJECTION_WINDOW_MS))).toBe("active"); // accepted late: window already passed
  });

  it("the sweep promotes accepted invites once the window passes, never unaccepted ones", () => {
    const accepted = invite(later(1000));
    expect(isDue(accepted, later(OBJECTION_WINDOW_MS - 1))).toBe(false);
    expect(isDue(accepted, later(OBJECTION_WINDOW_MS))).toBe(true);
    expect(isDue(invite(), later(OBJECTION_WINDOW_MS * 2))).toBe(false);
    expect(isDue({ ...accepted, status: "active" }, later(OBJECTION_WINDOW_MS))).toBe(false);
  });

  it("shows joins_at only while an accepted invite is waiting", () => {
    expect(visibleJoinsAt(invite())).toBeNull();
    expect(visibleJoinsAt(invite(later(1000)))).toEqual(later(OBJECTION_WINDOW_MS));
    expect(visibleJoinsAt({ status: "active", invitedAt, acceptedAt: later(1000) })).toBeNull();
  });

  it("caps a squad at 6 people, counting invites", () => {
    expect(hasRoom(1, 5)).toBe(true);
    expect(hasRoom(5, 1)).toBe(true);
    expect(hasRoom(5, 2)).toBe(false);
  });
});
