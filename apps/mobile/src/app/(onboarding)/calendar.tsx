// Owner: Andy (route) — hosts Riley's calendar step. When features/calendar exports a
// component taking OnboardingStepProps, render it here in place of the placeholder.
import { stepEyebrow } from "../../lib/onboarding";
import { useOnboardingNav } from "../../lib/useOnboardingNav";
import { StepPlaceholder } from "../../ui";

export default function CalendarStep() {
  const onDone = useOnboardingNav("calendar");
  return (
    <StepPlaceholder
      eyebrow={stepEyebrow("calendar")}
      title="Connect your calendar"
      owner="Riley"
      description="Grants calendar access and syncs busy blocks only, never event titles. Lands with Riley's calendar PR."
      onDone={onDone}
    />
  );
}
