import { describe, expect, it } from "vitest";
import { nextStep, ONBOARDING_STEPS, resumeAfterLogin, stepEyebrow, stepProgress } from "./onboarding";

describe("stepEyebrow", () => {
  it("labels each step for the screen eyebrow", () => {
    expect(stepEyebrow("signup")).toBe("Step 1 of 7");
    expect(stepEyebrow("name")).toBe("Step 2 of 7");
    expect(stepEyebrow("verify-email")).toBe("Step 3 of 7");
    expect(stepEyebrow("favorites")).toBe("Step 6 of 7");
  });
});

describe("nextStep", () => {
  it("follows the demo order: welcome → sign up → name → verify email → location → calendar → favorites → friends → main", () => {
    const visited: string[] = ["welcome"];
    let step = nextStep("welcome");
    while (step !== "done") {
      visited.push(step);
      step = nextStep(step);
    }
    expect(visited).toEqual(["welcome", "signup", "name", "verify-email", "location", "calendar", "favorites", "friends"]);
  });

  it("finishes after close friends", () => {
    expect(nextStep("friends")).toBe("done");
  });
});

describe("stepProgress", () => {
  it("counts every step after welcome", () => {
    expect(stepProgress("signup")).toEqual({ current: 1, total: 7 });
    expect(stepProgress("friends")).toEqual({ current: 7, total: 7 });
    expect(stepProgress("friends").total).toBe(ONBOARDING_STEPS.length - 1);
  });
});

describe("resumeAfterLogin", () => {
  it("asks a just-signed-up account (no name, no home) for its name first", () => {
    expect(resumeAfterLogin({ home_lat: null, email_verified: false, display_name: null }, 0)).toBe("name");
  });

  it("skips the name step once a name is set", () => {
    expect(resumeAfterLogin({ home_lat: null, email_verified: false, display_name: "Pres" }, 0)).toBe("verify-email");
    expect(resumeAfterLogin({ home_lat: null, email_verified: true, display_name: "Pres" }, 0)).toBe("location");
  });

  it("never blocks a returning user's login on the name prompt: no name still enters the app", () => {
    expect(resumeAfterLogin({ home_lat: 28.602, email_verified: true, display_name: null }, 1)).toBe("done");
    expect(resumeAfterLogin({ home_lat: 28.602, email_verified: true, display_name: null }, 0)).toBe("friends");
  });

  it("sends a named, just-signed-up account (unverified, no home) to verify its email", () => {
    expect(resumeAfterLogin({ home_lat: null, email_verified: false, display_name: "Pres" }, 0)).toBe("verify-email");
  });

  it("sends a verified user with no home location to the location step", () => {
    expect(resumeAfterLogin({ home_lat: null, email_verified: true, display_name: "Pres" }, 0)).toBe("location");
  });

  it("asks for location first even when friends already exist", () => {
    expect(resumeAfterLogin({ home_lat: null, email_verified: true, display_name: "Pres" }, 2)).toBe("location");
  });

  it("never sends a returning user with a home back to verify, even if still unverified", () => {
    expect(resumeAfterLogin({ home_lat: 28.602, email_verified: false, display_name: "Pres" }, 0)).toBe("friends");
    expect(resumeAfterLogin({ home_lat: 28.602, email_verified: false, display_name: "Pres" }, 1)).toBe("done");
  });

  it("sends a user with a home but no friends or sent requests to the friends step", () => {
    expect(resumeAfterLogin({ home_lat: 28.602, email_verified: true, display_name: "Pres" }, 0)).toBe("friends");
  });

  it("finishes (enter main) when home is set and they have a friend or a sent request", () => {
    expect(resumeAfterLogin({ home_lat: 28.602, email_verified: true, display_name: "Pres" }, 1)).toBe("done");
  });
});
