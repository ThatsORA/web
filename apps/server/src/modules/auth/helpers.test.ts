import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { isUniqueViolation, roundCoord, toMe } from "./helpers";

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
    const me = toMe({ id: "u1", username: "ojas", email: "o@x.io", passwordHash: "secret", timezone: "UTC", homeLat: null, homeLng: null, travelMode: "DRIVE", createdAt: new Date() });
    expect(JSON.stringify(me)).not.toContain("secret");
    expect(me).not.toHaveProperty("passwordHash");
  });
});
