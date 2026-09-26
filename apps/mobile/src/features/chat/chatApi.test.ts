import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  api: mocks.api,
}));

import { getEventMessages, sendChatMessage } from "./chatApi";

const eventId = "3c48fb35-1518-481d-ab60-cfd2dcc28ac2";

describe("chatApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getEventMessages", () => {
    it("fetches messages without cursor", async () => {
      mocks.api.mockResolvedValueOnce({ messages: [], next_cursor: null });
      const res = await getEventMessages(eventId);
      expect(mocks.api).toHaveBeenCalledWith(
        `/events/${eventId}/messages`,
        expect.anything()
      );
      expect(res).toEqual({ messages: [], next_cursor: null });
    });

    it("fetches messages with before cursor encoded", async () => {
      const cursor = "2026-09-26T12:00:00.000Z";
      mocks.api.mockResolvedValueOnce({ messages: [], next_cursor: null });
      await getEventMessages(eventId, cursor);
      expect(mocks.api).toHaveBeenCalledWith(
        `/events/${eventId}/messages?before=${encodeURIComponent(cursor)}`,
        expect.anything()
      );
    });
  });

  describe("sendChatMessage", () => {
    it("validates body and posts to event messages route", async () => {
      const msg = {
        id: "11111111-1111-4111-8111-111111111111",
        event_id: eventId,
        user_id: "6f48fb35-1518-481d-ab60-cfd2dcc28acf",
        username: "ojas",
        body: "Let's meet at 7",
        created_at: "2026-09-26T12:00:00.000Z",
      };
      mocks.api.mockResolvedValueOnce(msg);
      const res = await sendChatMessage(eventId, "Let's meet at 7");
      expect(mocks.api).toHaveBeenCalledWith(
        `/events/${eventId}/messages`,
        expect.anything(),
        {
          method: "POST",
          body: { body: "Let's meet at 7" },
        }
      );
      expect(res).toEqual(msg);
    });

    it("throws on empty body", async () => {
      await expect(sendChatMessage(eventId, "")).rejects.toThrow();
      expect(mocks.api).not.toHaveBeenCalled();
    });
  });
});
