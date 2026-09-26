import { describe, expect, it } from "vitest";
import { nextStep, ONBOARDING_STEPS, resumeAfterLogin, stepEyebrow, stepProgress } from "./onboarding";

describe("stepEyebrow", () => {
  it("labels each step for the screen eyebrow", () => {
    expect(stepEyebrow("signup")).toBe("Step 1 of 6");
    expect(stepEyebrow("verify-email")).toBe("Step 2 of 6");
    expect(stepEyebrow("favorites")).toBe("Step 5 of 6");
  });
});

describe("nextStep", () => {
  it("follows the demo order: welcome → sign up → verify email → location → calendar → favorites → friends → main", () => {
    const visited: string[] = ["welcome"];
    let step = nextStep("welcome");
    while (step !== "done") {
      visited.push(step);
      step = nextStep(step);
    }
    expect(visited).toEqual(["welcome", "signup", "verify-email", "location", "calendar", "favorites", "friends"]);
  });

  it("finishes after close friends", () => {
    expect(nextStep("friends")).toBe("done");
  });
});

describe("stepProgress", () => {
  it("counts every step after welcome", () => {
    expect(stepProgress("signup")).toEqual({ current: 1, total: 6 });
    expect(stepProgress("friends")).toEqual({ current: 6, total: 6 });
    expect(stepProgress("friends").total).toBe(ONBOARDING_STEPS.length - 1);
  });
});

describe("resumeAfterLogin", () => {
  it("sends a just-signed-up account (unverified, no home) to verify its email", () => {
    expect(resumeAfterLogin({ home_lat: null, email_verified: false }, 0)).toBe("verify-email");
  });

  it("sends a verified user with no home location to the location step", () => {
    expect(resumeAfterLogin({ home_lat: null, email_verified: true }, 0)).toBe("location");
  });

  it("asks for location first even when friends already exist", () => {
    expect(resumeAfterLogin({ home_lat: null, email_verified: true }, 2)).toBe("location");
  });

  it("never sends a returning user with a home back to verify, even if still unverified", () => {
    expect(resumeAfterLogin({ home_lat: 28.602, email_verified: false }, 0)).toBe("friends");
    expect(resumeAfterLogin({ home_lat: 28.602, email_verified: false }, 1)).toBe("done");
  });

  it("sends a user with a home but no friends or sent requests to the friends step", () => {
    expect(resumeAfterLogin({ home_lat: 28.602, email_verified: true }, 0)).toBe("friends");
  });

  it("finishes (enter main) when home is set and they have a friend or a sent request", () => {
    expect(resumeAfterLogin({ home_lat: 28.602, email_verified: true }, 1)).toBe("done");
  });
});
