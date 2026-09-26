// Owner: Andy (route) — hosts Riley's calendar permission and sync step.
import { CalendarStep } from "../../features/calendar";
import { useOnboardingNav } from "../../lib/useOnboardingNav";

export default function CalendarRoute() {
  const onDone = useOnboardingNav("calendar");
  return <CalendarStep onDone={onDone} />;
}
