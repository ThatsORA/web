// Owner: Andy (route) — hosts Ojas's close-friends step, the last onboarding step.
// When features/friends exports a component taking OnboardingStepProps, render it here.
import { stepEyebrow } from "../../lib/onboarding";
import { useOnboardingNav } from "../../lib/useOnboardingNav";
import { StepPlaceholder } from "../../ui";

export default function Friends() {
  const onDone = useOnboardingNav("friends");
  return (
    <StepPlaceholder
      eyebrow={stepEyebrow("friends")}
      title="Add close friends"
      owner="Ojas"
      description="Search by username and tap Add. You only ever see Added. Lands with Ojas's friends PR."
      onDone={onDone}
    />
  );
}
