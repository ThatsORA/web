import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  api: mocks.api,
}));

import { useFriendsData } from "./useFriendsData";
import { useBusyAction } from "./useBusyAction";

describe("friends hooks (#205)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useFriendsData export", () => {
    it("is defined as a function", () => {
      expect(typeof useFriendsData).toBe("function");
    });
  });

  describe("useBusyAction export", () => {
    it("is defined as a function", () => {
      expect(typeof useBusyAction).toBe("function");
    });
  });
});
