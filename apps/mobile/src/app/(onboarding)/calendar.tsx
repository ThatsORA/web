// Owner: Andy (route) — hosts Riley's calendar permission and sync step.
import { CalendarStep } from "../../features/calendar";
import { getToken } from "../../lib/api";
import { stepEyebrow } from "../../lib/onboarding";
import { useOnboardingNav } from "../../lib/useOnboardingNav";
import { Button, Callout, Screen } from "../../ui";

export default function CalendarRoute() {
  const onDone = useOnboardingNav("calendar");
  if (!getToken()) {
    return (
      <Screen
        eyebrow={stepEyebrow("calendar")}
        title="Connect your calendar"
        footer={<Button label="Continue for now" onPress={onDone} />}
      >
        <Callout tone="warning" title="Sign in to sync">
          Calendar sync needs a signed-in account. Finish account setup before connecting your calendar.
        </Callout>
      </Screen>
    );
  }
  return <CalendarStep onDone={onDone} />;
}
