// Owner: Andy (route) — hosts Ojas's close-friends step, the last onboarding step.
import { FriendsStep } from "../../features/friends";
import { markMatcherTriggered } from "../../lib/matcherTrigger";
import { useOnboardingNav } from "../../lib/useOnboardingNav";

export default function Friends() {
  const next = useOnboardingNav("friends");
  // Adding a close friend runs the matcher, so the feed shows "Finding a time…" briefly (#99).
  const onDone = () => {
    markMatcherTriggered();
    next();
  };
  return <FriendsStep onDone={onDone} />;
}
