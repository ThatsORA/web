// Owner: Andy — moves the onboarding stack forward, then hands off to (main).
import { CloseFriendsResponse, Me, routes } from "@web/contract";
import { router } from "expo-router";
import { useCallback, useRef } from "react";
import { api } from "./api";
import { nextStep, resumeAfterLogin, type OnboardingStep, type ResumeStep } from "./onboarding";

const HREF = {
  welcome: "/(onboarding)",
  signup: "/(onboarding)/signup",
  "verify-email": "/(onboarding)/verify-email",
  location: "/(onboarding)/location",
  calendar: "/(onboarding)/calendar",
  favorites: "/(onboarding)/favorites",
  friends: "/(onboarding)/friends",
} as const satisfies Record<OnboardingStep, string>;

/** Where a signed-in user lands for each resume step. */
export const RESUME_HREF = {
  "verify-email": HREF["verify-email"],
  location: HREF.location,
  friends: HREF.friends,
  done: "/(main)",
} as const satisfies Record<ResumeStep, string>;

/** Returns the `onDone` callback for a step. */
export function useOnboardingNav(step: OnboardingStep): () => void {
  return useCallback(() => {
    const next = nextStep(step);
    if (next === "done") router.replace("/(main)");
    else router.push(HREF[next]);
  }, [step]);
}

/** GET /me + GET /friends/close → where this signed-in account picks up. Throws ApiError (e.g. 401). */
export async function fetchResumeStep(): Promise<ResumeStep> {
  const [me, close] = await Promise.all([api(routes.me, Me), api(routes.closeFriends, CloseFriendsResponse)]);
  return resumeAfterLogin(me, close.friends.length);
}

/**
 * The `onDone` for the auth step (sign-up and login alike): skip what the account already
 * set up. A new account has no home, so it continues verify email → location → calendar →
 * favorites → friends.
 * Uses replace so Back can't return to the auth form (or, from (main), to onboarding).
 */
export function useResumeAfterAuth(): () => void {
  const inFlight = useRef(false);
  return useCallback(() => {
    if (inFlight.current) return; // AuthStep re-enables its button before we navigate
    inFlight.current = true;
    fetchResumeStep()
      .catch((): ResumeStep => "location") // couldn't read the account: fall back to the full sequence
      .then((step) => router.replace(RESUME_HREF[step]))
      .finally(() => {
        inFlight.current = false;
      });
  }, []);
}
