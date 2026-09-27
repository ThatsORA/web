import { describe, expect, it, vi } from "vitest";
import { runCardAction } from "./cardAction";

describe("runCardAction", () => {
  it("shows no notice when the call works, and refetches", async () => {
    const refetch = vi.fn(async () => {});
    expect(await runCardAction(async () => {}, refetch)).toBeUndefined();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows the error message by default when the call fails, and still refetches", async () => {
    const refetch = vi.fn(async () => {});
    expect(await runCardAction(async () => Promise.reject(new Error("409 closed")), refetch)).toBe("409 closed");
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the action's notice when the refetch itself fails", async () => {
    const failed = await runCardAction(
      async () => Promise.reject(new Error("x")),
      async () => Promise.reject(new Error("offline")),
      () => "Try again.",
    );
    expect(failed).toBe("Try again.");
  });
});
