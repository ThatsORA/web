// Owner: Andy (route) — hosts Ojas's "Check your email" step (#91). Reached after the name
// step (or straight from sign-up when resumeAfterLogin finds a name but no home), then location.
import { VerifyEmailStep } from "../../features/auth";
import { useOnboardingNav } from "../../lib/useOnboardingNav";

export default function VerifyEmail() {
  const onDone = useOnboardingNav("verify-email");
  return <VerifyEmailStep onDone={onDone} />;
}
