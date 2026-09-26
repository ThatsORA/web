import { describe, expect, it } from "vitest";
import { nextStep, ONBOARDING_STEPS, stepEyebrow, stepProgress } from "./onboarding";

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
