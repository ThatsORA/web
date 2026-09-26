// Owner: Andy — stand-in for an onboarding step whose owner hasn't landed it yet.
import type { OnboardingStepProps } from "../lib/onboarding";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { Screen } from "./Screen";

type Props = OnboardingStepProps & { eyebrow?: string; title: string; owner: string; description: string };

export function StepPlaceholder({ eyebrow, title, owner, description, onDone }: Props) {
  return (
    <Screen eyebrow={eyebrow} title={title} footer={<Button label="Continue" onPress={onDone} />}>
      <Callout title={`Placeholder: ${owner}'s step`}>{description}</Callout>
    </Screen>
  );
}
