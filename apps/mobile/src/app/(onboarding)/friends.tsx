// Owner: Andy (route) — hosts Ojas's close-friends step, the last onboarding step.
import { FriendsStep } from "../../features/friends";
import { useOnboardingNav } from "../../lib/useOnboardingNav";

export default function Friends() {
  const onDone = useOnboardingNav("friends");
  return <FriendsStep onDone={onDone} />;
}
