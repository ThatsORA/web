// Owner: Andy — onboarding sequence (demo script steps 1–4). Pure, no React Native.
// Hosted steps from other lanes (sign up, calendar, close friends) are components
// that take OnboardingStepProps and call onDone() when finished.

export const ONBOARDING_STEPS = ["welcome", "signup", "location", "calendar", "favorites", "friends"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** The contract every hosted step component implements. */
export type OnboardingStepProps = { onDone: () => void };

/** The step after `step`, or "done" when onboarding is finished and the app should enter (main). */
export function nextStep(step: OnboardingStep): OnboardingStep | "done" {
  const i = ONBOARDING_STEPS.indexOf(step);
  return ONBOARDING_STEPS[i + 1] ?? "done";
}

/** 1-based position for "Step 2 of 5". The welcome screen isn't counted. */
export function stepProgress(step: OnboardingStep): { current: number; total: number } {
  return { current: ONBOARDING_STEPS.indexOf(step), total: ONBOARDING_STEPS.length - 1 };
}

/** Screen eyebrow for a step, e.g. "Step 2 of 5" (Txt uppercases it). */
export function stepEyebrow(step: OnboardingStep): string {
  const { current, total } = stepProgress(step);
  return `Step ${current} of ${total}`;
}
