import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  api: mocks.api,
}));

import {
  acceptFriendRequest,
  deleteFriendRequest,
  getFriendRequests,
  getFriends,
  searchUsers,
  sendFriendRequest,
  starCloseFriend,
  unfriend,
  unstarCloseFriend,
} from "./friendsApi";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("friendsApi (#94)", () => {
  describe("searchUsers", () => {
    it("returns empty array for empty query without calling api", async () => {
      expect(await searchUsers("")).toEqual([]);
      expect(await searchUsers("   ")).toEqual([]);
      expect(mocks.api).not.toHaveBeenCalled();
    });

    it("queries userSearch route with encoded term", async () => {
      mocks.api.mockResolvedValueOnce({
        users: [{ id: "u-1", username: "riley" }],
      });
      const res = await searchUsers("riley");
      expect(mocks.api).toHaveBeenCalledWith("/users/search?q=riley", expect.anything());
      expect(res).toEqual([{ id: "u-1", username: "riley" }]);
    });
  });

  describe("getFriends", () => {
    it("fetches accepted friends list", async () => {
      mocks.api.mockResolvedValueOnce({
        friends: [{ id: "u-1", username: "riley", close: true }],
      });
      const friends = await getFriends();
      expect(mocks.api).toHaveBeenCalledWith("/friends", expect.anything());
      expect(friends).toEqual([{ id: "u-1", username: "riley", close: true }]);
    });
  });

  describe("getFriendRequests", () => {
    it("fetches incoming and outgoing requests", async () => {
      const payload = {
        incoming: [{ id: "req-1", user: { id: "u-1", username: "andy" }, requested_at: "2026-09-26T12:00:00Z" }],
        outgoing: [{ id: "req-2", user: { id: "u-2", username: "riley" }, requested_at: "2026-09-26T12:05:00Z" }],
      };
      mocks.api.mockResolvedValueOnce(payload);
      const res = await getFriendRequests();
      expect(mocks.api).toHaveBeenCalledWith("/friends/requests", expect.anything());
      expect(res).toEqual(payload);
    });
  });

  describe("sendFriendRequest", () => {
    it("sends friend request with parsed body and returns response status", async () => {
      mocks.api.mockResolvedValueOnce({ status: "requested" });
      const res = await sendFriendRequest("riley");
      expect(mocks.api).toHaveBeenCalledWith(
        "/friends/requests",
        expect.anything(),
        { method: "POST", body: { username: "riley" } }
      );
      expect(res).toEqual({ status: "requested" });
    });

    it("handles auto-accept when crossing requests occur", async () => {
      mocks.api.mockResolvedValueOnce({ status: "friends" });
      const res = await sendFriendRequest("andy");
      expect(res).toEqual({ status: "friends" });
    });
  });

  describe("acceptFriendRequest", () => {
    it("posts to /friends/requests/:id/accept", async () => {
      mocks.api.mockResolvedValueOnce(undefined);
      await acceptFriendRequest("req-1");
      expect(mocks.api).toHaveBeenCalledWith(
        "/friends/requests/req-1/accept",
        expect.anything(),
        { method: "POST" }
      );
    });
  });

  describe("deleteFriendRequest", () => {
    it("sends DELETE to /friends/requests/:id for decline or cancel", async () => {
      mocks.api.mockResolvedValueOnce(undefined);
      await deleteFriendRequest("req-1");
      expect(mocks.api).toHaveBeenCalledWith(
        "/friends/requests/req-1",
        expect.anything(),
        { method: "DELETE" }
      );
    });
  });

  describe("unfriend", () => {
    it("sends DELETE to /friends/:userId", async () => {
      mocks.api.mockResolvedValueOnce(undefined);
      await unfriend("u-1");
      expect(mocks.api).toHaveBeenCalledWith(
        "/friends/u-1",
        expect.anything(),
        { method: "DELETE" }
      );
    });
  });

  describe("starCloseFriend and unstarCloseFriend", () => {
    it("posts to /friends/close to star a close friend", async () => {
      mocks.api.mockResolvedValueOnce(undefined);
      await starCloseFriend("riley");
      expect(mocks.api).toHaveBeenCalledWith(
        "/friends/close",
        expect.anything(),
        { method: "POST", body: { username: "riley" } }
      );
    });

    it("sends DELETE to /friends/close/:userId to unstar", async () => {
      mocks.api.mockResolvedValueOnce(undefined);
      await unstarCloseFriend("u-1");
      expect(mocks.api).toHaveBeenCalledWith(
        "/friends/close/u-1",
        expect.anything(),
        { method: "DELETE" }
      );
    });
  });
});
