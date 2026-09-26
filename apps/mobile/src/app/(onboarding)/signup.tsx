// Owner: Andy (route) — hosts Ojas's sign-up step. When features/auth exports a
// component taking OnboardingStepProps (it must call session.save(token) before onDone),
// render it here in place of the placeholder.
import { useOnboardingNav } from "../../lib/useOnboardingNav";
import { StepPlaceholder } from "../../ui";

export default function SignUp() {
  const onDone = useOnboardingNav("signup");
  return (
    <StepPlaceholder
      title="Create your account"
      owner="Ojas"
      description="Email, username and password. Timezone comes from the device. Lands with Ojas's auth PR."
      onDone={onDone}
    />
  );
}
