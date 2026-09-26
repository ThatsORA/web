import { describe, expect, it } from "vitest";
import { canAccept, onDelete, onSend, requestView, type RequestRow } from "./requests";

const A = "a";
const B = "b";
const pending = (by: string, declinedAt: Date | null = null): RequestRow => ({ status: "pending", requestedById: by, declinedAt });
const accepted: RequestRow = { status: "accepted", requestedById: null, declinedAt: null };

describe("friend requests", () => {
  it("send: creates, repeats are no-ops, crossing requests accept", () => {
    expect(onSend(null, A)).toBe("create");
    expect(onSend(pending(A), A)).toBe("requested");
    expect(onSend(pending(B), A)).toBe("accept");
    expect(onSend(accepted, A)).toBe("friends");
  });

  it("send after I declined them accepts their request", () => {
    expect(onSend(pending(B, new Date()), A)).toBe("accept");
  });

  it("only the recipient can accept", () => {
    expect(canAccept(pending(B), A)).toBe(true);
    expect(canAccept(pending(A), A)).toBe(false);
    expect(canAccept(accepted, A)).toBe(false);
  });

  it("delete: requester cancels, recipient declines", () => {
    expect(onDelete(pending(A), A)).toBe("cancel");
    expect(onDelete(pending(B), A)).toBe("decline");
  });

  it("a decline hides it from the recipient but the requester still sees it pending", () => {
    const declined = pending(A, new Date());
    expect(requestView(declined, B)).toBeNull();
    expect(requestView(declined, A)).toBe("outgoing");
    expect(requestView(pending(A), B)).toBe("incoming");
    expect(requestView(accepted, A)).toBeNull();
  });
});
