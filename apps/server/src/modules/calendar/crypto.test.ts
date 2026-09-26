import { describe, it, expect, vi } from "vitest";
import { signState, verifyState, encryptToken, decryptToken } from "./crypto";

describe("crypto", () => {
  describe("State signing and verification", () => {
    it("should sign and verify a valid state", () => {
      const userId = "user-123";
      const redirectUri = "myapp://callback";
      const state = signState(userId, redirectUri);
      
      const result = verifyState(state);
      expect(result.userId).toBe(userId);
      expect(result.redirectUri).toBe(redirectUri);
    });

    it("should reject an expired state", () => {
      const originalNow = Date.now;
      Date.now = vi.fn(() => 1000000000000);
      const state = signState("user-123");
      
      // Fast forward 11 minutes
      Date.now = vi.fn(() => 1000000000000 + 11 * 60 * 1000);
      
      expect(() => verifyState(state)).toThrow("State parameter expired");
      Date.now = originalNow;
    });

    it("should reject tampered signature", () => {
      const state = signState("user-123");
      const parts = state.split(".");
      const tamperedState = `${parts[0]}.tampered${parts[1]}`;
      
      expect(() => verifyState(tamperedState)).toThrow("Invalid state signature");
    });

    it("should reject tampered payload", () => {
      const state = signState("user-123");
      const parts = state.split(".");
      const tamperedPayload = Buffer.from(JSON.stringify({ userId: "hacker", exp: Date.now() + 10000 })).toString("base64url");
      const tamperedState = `${tamperedPayload}.${parts[1]}`;
      
      expect(() => verifyState(tamperedState)).toThrow("Invalid state signature");
    });
  });

  describe("AES-256-GCM token encryption", () => {
    it("should encrypt and decrypt correctly", () => {
      const token = "1//0g_abc123-very-long-refresh-token";
      const encrypted = encryptToken(token);
      expect(encrypted).not.toBe(token);
      expect(encrypted.split(":")).toHaveLength(3);
      
      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(token);
    });

    it("should fail decryption if tampered", () => {
      const token = "secret-token";
      const encrypted = encryptToken(token);
      
      // Tamper ciphertext
      const parts = encrypted.split(":");
      parts[2] = parts[2] === "A" ? "B" : "A"; // Just break the base64 or content
      
      expect(() => decryptToken(parts.join(":"))).toThrow();
    });
  });
});
