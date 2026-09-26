// Owner: Andy — welcome screen.
import { Button, Screen } from "../../ui";
import { useOnboardingNav } from "../../lib/useOnboardingNav";

export default function Welcome() {
  const onDone = useOnboardingNav("welcome");
  return (
    <Screen
      title="Web"
      subtitle="Hangouts that plan themselves. Tell us when you're busy and who your close friends are; we'll find the time and the place."
      footer={<Button label="Get started" onPress={onDone} />}
    />
  );
}
