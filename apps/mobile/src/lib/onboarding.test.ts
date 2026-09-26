import { describe, expect, it } from "vitest";
import { nextStep, ONBOARDING_STEPS, resumeAfterLogin, stepEyebrow, stepProgress } from "./onboarding";

describe("stepEyebrow", () => {
  it("labels each step for the screen eyebrow", () => {
    expect(stepEyebrow("signup")).toBe("Step 1 of 5");
    expect(stepEyebrow("favorites")).toBe("Step 4 of 5");
  });
});

describe("nextStep", () => {
  it("follows the demo order: welcome → sign up → location → calendar → favorites → friends → main", () => {
    const visited: string[] = ["welcome"];
    let step = nextStep("welcome");
    while (step !== "done") {
      visited.push(step);
      step = nextStep(step);
    }
    expect(visited).toEqual(["welcome", "signup", "location", "calendar", "favorites", "friends"]);
  });

  it("finishes after close friends", () => {
    expect(nextStep("friends")).toBe("done");
  });
});

describe("stepProgress", () => {
  it("counts every step after welcome", () => {
    expect(stepProgress("signup")).toEqual({ current: 1, total: 5 });
    expect(stepProgress("friends")).toEqual({ current: 5, total: 5 });
    expect(stepProgress("friends").total).toBe(ONBOARDING_STEPS.length - 1);
  });
});

describe("resumeAfterLogin", () => {
  it("sends a user with no home location to the location step", () => {
    expect(resumeAfterLogin({ home_lat: null }, 0)).toBe("location");
  });

  it("asks for location first even when close friends already exist", () => {
    expect(resumeAfterLogin({ home_lat: null }, 2)).toBe("location");
  });

  it("sends a user with a home but no close friends to the friends step", () => {
    expect(resumeAfterLogin({ home_lat: 28.602 }, 0)).toBe("friends");
  });

  it("finishes (enter main) when home and at least one close friend are set", () => {
    expect(resumeAfterLogin({ home_lat: 28.602 }, 1)).toBe("done");
  });
});
