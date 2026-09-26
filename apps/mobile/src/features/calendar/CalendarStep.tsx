import { useState } from "react";
import type { OnboardingStepProps } from "../../lib/onboarding";
import { Button, Callout, Screen } from "../../ui";
import { createDeviceCalendarSync } from "./device";

export function CalendarStep({ onDone }: OnboardingStepProps) {
  const [sync] = useState(createDeviceCalendarSync);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function connect() {
    setLoading(true);
    setError(null);
    try {
      const stored = await sync.sync(true);
      setCount(stored);
      if (stored === null) setError("Calendar access was not granted. You can try again or skip this step.");
    } catch {
      setError("Calendar sync is unavailable. Try again or skip this step.");
    } finally { setLoading(false); }
  }
  return (
    <Screen title="Connect your calendar" footer={<Button label={count === null ? "Skip for now" : "Continue"} onPress={onDone} disabled={loading} />}>
      <Callout title={count === null ? "Share when you’re busy" : `Synced ${count} busy blocks`}>
        We only sync busy times. Event titles, notes and attendees stay on your device.
      </Callout>
      {error ? <Callout tone="warning">{error}</Callout> : null}
      <Button label={count === null ? "Connect calendar" : "Sync again"} onPress={() => { void connect(); }} loading={loading} />
    </Screen>
  );
}
