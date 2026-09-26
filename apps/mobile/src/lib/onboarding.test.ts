import { describe, expect, it } from "vitest";
import { nextStep, ONBOARDING_STEPS, stepProgress } from "./onboarding";

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
