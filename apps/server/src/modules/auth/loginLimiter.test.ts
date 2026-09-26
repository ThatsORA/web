import { describe, expect, it } from "vitest";
import { createLoginLimiter } from "./loginLimiter";

describe("login limiter", () => {
  it("allows five failures, then blocks until exactly 15 minutes from the first failure", () => {
    const limiter = createLoginLimiter();
    for (let i = 0; i < 5; i++) {
      expect(limiter.retryAfter("a@example.com", "ip", i)).toBe(0);
      limiter.failed("a@example.com", "ip", i);
    }
    expect(limiter.retryAfter("A@example.com", "ip", 100)).toBe(900);
    expect(limiter.retryAfter("a@example.com", "ip", 899_999)).toBe(1);
    expect(limiter.retryAfter("a@example.com", "ip", 900_000)).toBe(0);
    limiter.failed("a@example.com", "ip", 900_000);
    expect(limiter.retryAfter("a@example.com", "ip", 900_001)).toBe(0);
  });
  it("isolates both email and IP, and success clears the matching counter", () => {
    const limiter = createLoginLimiter();
    for (let i = 0; i < 5; i++) limiter.failed("a@example.com", "ip", 0);
    expect(limiter.retryAfter("b@example.com", "ip", 0)).toBe(0);
    expect(limiter.retryAfter("a@example.com", "other-ip", 0)).toBe(0);
    limiter.succeeded("a@example.com", "ip");
    for (let i = 0; i < 4; i++) limiter.failed("a@example.com", "ip", 1);
    expect(limiter.retryAfter("a@example.com", "ip", 1)).toBe(0);
  });
});
