import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  api: mocks.api,
}));

import { addCloseFriend, getCloseFriends, removeCloseFriend, searchUsers } from "./friendsApi";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("friendsApi", () => {
  describe("searchUsers", () => {
    it("returns empty array for empty or whitespace query without network call", async () => {
      expect(await searchUsers("")).toEqual([]);
      expect(await searchUsers("   ")).toEqual([]);
      expect(mocks.api).not.toHaveBeenCalled();
    });

    it("searches with encoded query and returns matching users", async () => {
      mocks.api.mockResolvedValueOnce({
        users: [{ id: "u-1", username: "riley" }],
      });
      const results = await searchUsers("riley & co");
      expect(mocks.api).toHaveBeenCalledWith(
        "/users/search?q=riley%20%26%20co",
        expect.anything()
      );
      expect(results).toEqual([{ id: "u-1", username: "riley" }]);
    });
  });

  describe("getCloseFriends", () => {
    it("fetches close friends list with id and username and no mutual flag", async () => {
      mocks.api.mockResolvedValueOnce({
        friends: [
          { id: "u-1", username: "riley" },
          { id: "u-2", username: "andy" },
        ],
      });
      const friends = await getCloseFriends();
      expect(mocks.api).toHaveBeenCalledWith("/friends/close", expect.anything());
      expect(friends).toEqual([
        { id: "u-1", username: "riley" },
        { id: "u-2", username: "andy" },
      ]);
      // Verify no mutual property exists on the returned objects
      for (const f of friends) {
        expect(f).not.toHaveProperty("mutual");
      }
    });
  });

  describe("addCloseFriend", () => {
    it("posts to /friends/close with parsed body", async () => {
      mocks.api.mockResolvedValueOnce(undefined);
      await addCloseFriend("riley");
      expect(mocks.api).toHaveBeenCalledWith(
        "/friends/close",
        expect.anything(),
        {
          method: "POST",
          body: { username: "riley" },
        }
      );
    });
  });

  describe("removeCloseFriend", () => {
    it("sends DELETE to /friends/close/:userId silently", async () => {
      mocks.api.mockResolvedValueOnce(undefined);
      await removeCloseFriend("u-123");
      expect(mocks.api).toHaveBeenCalledWith(
        "/friends/close/u-123",
        expect.anything(),
        { method: "DELETE" }
      );
    });
  });
});
