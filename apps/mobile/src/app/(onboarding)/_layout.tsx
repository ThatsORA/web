// Owner: Andy — onboarding flow container. Steps (demo script 1–4):
// welcome → sign up (Ojas) → name → verify email (Ojas) → location → calendar (Riley) → favorites (Andy) → close friends (Ojas) → (main).
// Order lives in lib/onboarding.ts; each screen calls useOnboardingNav(step) for its onDone.
import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
