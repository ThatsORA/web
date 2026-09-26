// Owner: Andy (route) — hosts Ojas's sign-up and login step. Both resume via /me + close friends:
// a new account continues to location; a returning one skips what it already set up.
import { SignupStep } from "../../features/auth";
import { useResumeAfterAuth } from "../../lib/useOnboardingNav";

export default function SignUp() {
  const onDone = useResumeAfterAuth();
  return <SignupStep onDone={onDone} />;
}
