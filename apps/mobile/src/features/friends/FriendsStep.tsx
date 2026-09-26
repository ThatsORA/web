// Owner: Ojas — onboarding step 5: search by username, tap Add. You only ever see "Added"
// (demo step 4): nothing here says whether they've added you back.
import { useState } from "react";
import { stepEyebrow, type OnboardingStepProps } from "../../lib/onboarding";
import { Button, Screen } from "../../ui";
import { FriendSearch } from "./FriendSearch";

export function FriendsStep({ onDone }: OnboardingStepProps) {
  const [added, setAdded] = useState<string[]>([]);

  return (
    <Screen
      eyebrow={stepEyebrow("friends")}
      title="Add close friends"
      subtitle="Search by username. They won't be told, and you won't see if they add you back."
      footer={
        <Button
          label={added.length ? "Done" : "Skip for now"}
          variant={added.length ? "primary" : "ghost"}
          onPress={onDone}
        />
      }
    >
      <FriendSearch
        addedIds={added}
        onAdded={(user) => setAdded((prev) => (prev.includes(user.id) ? prev : [...prev, user.id]))}
      />
    </Screen>
  );
}
