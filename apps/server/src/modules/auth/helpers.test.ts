import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { env } from "../../env";
import { USERNAME_COOLDOWN_MS, isUniqueViolation, roundCoord, toMe, toPublicUser, usernameRetryAt } from "./helpers";

describe("roundCoord", () => {
  it("rounds to 3 decimals, including negatives", () => {
    expect(roundCoord(25.7617)).toBe(25.762);
    expect(roundCoord(-80.3756)).toBe(-80.376);
    expect(roundCoord(-0.0001)).toBe(0);
  });
});

describe("isUniqueViolation", () => {
  it("matches only Prisma P2002", () => {
    const err = (code: string) => new Prisma.PrismaClientKnownRequestError("x", { code, clientVersion: "6" });
    expect(isUniqueViolation(err("P2002"))).toBe(true);
    expect(isUniqueViolation(err("P2025"))).toBe(false);
    expect(isUniqueViolation(new Error("P2002"))).toBe(false);
  });
});

describe("toMe", () => {
  it("never exposes the password hash", () => {
    const me = toMe({ id: "u1", username: "ojas", email: "o@x.io", passwordHash: "secret", timezone: "UTC", homeLat: null, homeLng: null, travelMode: "DRIVE", createdAt: new Date(), emailVerifiedAt: null, displayName: null, bio: null, usernameChangedAt: null, passwordChangedAt: null });
    expect(JSON.stringify(me)).not.toContain("secret");
    expect(me).not.toHaveProperty("passwordHash");
  });

  it("reports unverified accounts as verified only while verification is off", () => {
    const user = { id: "u1", username: "ojas", email: "o@x.io", passwordHash: "x", timezone: "UTC", homeLat: null, homeLng: null, travelMode: "DRIVE", createdAt: new Date(), emailVerifiedAt: null, displayName: null, bio: null, usernameChangedAt: null, passwordChangedAt: null };
    const was = env.EMAIL_VERIFICATION_REQUIRED;
    try {
      env.EMAIL_VERIFICATION_REQUIRED = true;
      expect(toMe(user).email_verified).toBe(false);
      env.EMAIL_VERIFICATION_REQUIRED = false;
      expect(toMe(user).email_verified).toBe(true);
    } finally {
      env.EMAIL_VERIFICATION_REQUIRED = was;
    }
  });
});

describe("usernameRetryAt", () => {
  const now = new Date("2026-09-26T12:00:00Z");
  it("allows a first change and one every 30 days", () => {
    expect(usernameRetryAt(null, now)).toBeNull();
    expect(usernameRetryAt(new Date(now.getTime() - USERNAME_COOLDOWN_MS), now)).toBeNull();
    expect(usernameRetryAt(new Date(now.getTime() - 1000), now)).toEqual(new Date(now.getTime() - 1000 + USERNAME_COOLDOWN_MS));
  });
});

describe("toPublicUser", () => {
  it("falls back to the username and carries nothing but id, username, display_name", () => {
    const u = { id: "u1", username: "ojas", displayName: null, email: "o@x.io", lowAddedHigh: true } as never;
    expect(toPublicUser(u)).toEqual({ id: "u1", username: "ojas", display_name: "ojas" });
    expect(toPublicUser({ id: "u1", username: "ojas", displayName: "Ojas P" })).toEqual({ id: "u1", username: "ojas", display_name: "Ojas P" });
  });
});
