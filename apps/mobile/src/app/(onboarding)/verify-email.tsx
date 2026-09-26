// Owner: Andy (route) — hosts Ojas's "Check your email" step (#91). Reached right after
// sign-up (resumeAfterLogin sends an unverified account with no home here), then location.
import { VerifyEmailStep } from "../../features/auth";
import { useOnboardingNav } from "../../lib/useOnboardingNav";

export default function VerifyEmail() {
  const onDone = useOnboardingNav("verify-email");
  return <VerifyEmailStep onDone={onDone} />;
}
