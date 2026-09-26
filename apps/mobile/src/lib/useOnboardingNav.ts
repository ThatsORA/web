// Owner: Andy — moves the onboarding stack forward, then hands off to (main).
import { router } from "expo-router";
import { useCallback } from "react";
import { nextStep, type OnboardingStep } from "./onboarding";

const HREF = {
  welcome: "/(onboarding)",
  signup: "/(onboarding)/signup",
  location: "/(onboarding)/location",
  calendar: "/(onboarding)/calendar",
  favorites: "/(onboarding)/favorites",
  friends: "/(onboarding)/friends",
} as const satisfies Record<OnboardingStep, string>;

/** Returns the `onDone` callback for a step. */
export function useOnboardingNav(step: OnboardingStep): () => void {
  return useCallback(() => {
    const next = nextStep(step);
    if (next === "done") router.replace("/(main)");
    else router.push(HREF[next]);
  }, [step]);
}
