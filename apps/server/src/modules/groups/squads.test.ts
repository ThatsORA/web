import { describe, expect, it } from "vitest";
import { hasRoom, isDue, onAccept, visibleJoinsAt, type Membership } from "./squads";

const invitedAt = new Date("2026-09-26T12:00:00Z");
const later = (ms: number) => new Date(invitedAt.getTime() + ms);
const invite = (acceptedAt: Date | null = null): Membership => ({ status: "invited", invitedAt, acceptedAt });

describe("squad consent", () => {
  it("accepting an invite makes you active instantly regardless of squad size", () => {
    expect(onAccept(invite(), 1, later(1000))).toBe("active");
    expect(onAccept(invite(), 2, later(1000))).toBe("active");
    expect(onAccept(invite(), 3, later(1000))).toBe("active");
    expect(onAccept(invite(), 5, later(1000))).toBe("active");
  });

  it("never marks invites as due since promotion is instant", () => {
    const accepted = invite(later(1000));
    expect(isDue(accepted, later(1000))).toBe(false);
    expect(isDue(invite(), later(10000))).toBe(false);
  });

  it("never returns visibleJoinsAt", () => {
    expect(visibleJoinsAt(invite())).toBeNull();
    expect(visibleJoinsAt(invite(later(1000)))).toBeNull();
    expect(visibleJoinsAt({ status: "active", invitedAt, acceptedAt: later(1000) })).toBeNull();
  });

  it("caps a squad at 6 people, counting invites", () => {
    expect(hasRoom(1, 5)).toBe(true);
    expect(hasRoom(5, 1)).toBe(true);
    expect(hasRoom(5, 2)).toBe(false);
  });
});
