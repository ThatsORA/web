import { FriendshipState } from "@web/contract";
import { describe, expect, it } from "vitest";
import { friendAction } from "./friendAction";

describe("friendAction", () => {
  it("offers Add friend to a stranger", () => {
    expect(friendAction("none", false)).toEqual({ label: "Add friend", variant: "primary", kind: "send" });
  });

  it("lets me cancel a request I sent", () => {
    expect(friendAction("requested", false)).toEqual({ label: "Requested · tap to cancel", variant: "outline", kind: "cancel" });
  });

  it("accepts their request by sending one back", () => {
    expect(friendAction("incoming", false)).toEqual({ label: "Accept friend request", variant: "primary", kind: "send" });
  });

  it("has no button once we're friends", () => {
    expect(friendAction("friends", false)).toBeNull();
  });

  it("never shows a button on my own profile", () => {
    for (const state of FriendshipState.options) expect(friendAction(state, true)).toBeNull();
  });
});
