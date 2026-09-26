// Owner: Andy — location permission; stores the home location rounded to ~100 m via PATCH /me.
import { Me, PatchMeRequest, routes } from "@web/contract";
import * as Location from "expo-location";
import { useState } from "react";
import { api } from "../../lib/api";
import { roundedHome } from "../../lib/geo";
import { stepEyebrow } from "../../lib/onboarding";
import { useOnboardingNav } from "../../lib/useOnboardingNav";
import { Button, Callout, Screen } from "../../ui";

export default function LocationStep() {
  const onDone = useOnboardingNav("location");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share() {
    setBusy(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Location permission was denied. You can enable it later in Settings.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const body = PatchMeRequest.parse(roundedHome(pos.coords));
      await api(routes.me, Me, { method: "PATCH", body });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      eyebrow={stepEyebrow("location")}
      title="Where's home?"
      subtitle="We use your approximate home to pick places that are fair for everyone to get to."
      footer={
        <>
          <Button label="Share my location" onPress={share} loading={busy} />
          {error ? <Button label="Skip for now" variant="ghost" onPress={onDone} /> : null}
        </>
      }
    >
      <Callout title="Rounded to about 100 m">Only a rounded location leaves your phone, never a live position.</Callout>
      {error ? (
        <Callout tone="danger" title="Couldn't save your location">
          {error}
        </Callout>
      ) : null}
    </Screen>
  );
}
