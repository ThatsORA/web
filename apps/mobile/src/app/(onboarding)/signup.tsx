// Owner: Andy (route) — hosts Ojas's sign-up and login step.
import { SignupStep } from "../../features/auth";
import { useOnboardingNav } from "../../lib/useOnboardingNav";

export default function SignUp() {
  const onDone = useOnboardingNav("signup");
  return <SignupStep onDone={onDone} />;
}
