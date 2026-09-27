// Owner: Andy — "What should friends call you?" (#211), right after sign-up. Saves through
// PATCH /me { display_name } (#96). Optional: skipping keeps the username as the name people see.
// Editing it later is the profile screen's job (#97).
import { DisplayName, Me, PatchMeRequest, routes } from "@web/contract";
import { useState } from "react";
import { api } from "../../lib/api";
import { stepEyebrow } from "../../lib/onboarding";
import { profileErrorMessage } from "../../lib/profile";
import { useOnboardingNav } from "../../lib/useOnboardingNav";
import { Button, Callout, Screen, TextField, Txt } from "../../ui";

export default function NameStep() {
  const onDone = useOnboardingNav("name");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = DisplayName.safeParse(draft); // the 1–40 character rule, trimmed
  const tooLong = !name.success && draft.trim() !== "";

  async function save() {
    if (!name.success) return;
    setBusy(true);
    setError(null);
    try {
      await api(routes.me, Me, { method: "PATCH", body: PatchMeRequest.parse({ display_name: name.data }) });
      onDone();
    } catch (e) {
      setError(profileErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      eyebrow={stepEyebrow("name")}
      title="What should friends call you?"
      subtitle="This is the name people see on hangouts and in their friend lists."
      footer={
        <>
          <Button label="Continue" onPress={() => void save()} loading={busy} disabled={!name.success} />
          <Button label="Skip for now" variant="ghost" onPress={onDone} disabled={busy} />
        </>
      }
    >
      <TextField
        label="Name"
        value={draft}
        onChangeText={setDraft}
        placeholder="Your name"
        autoCapitalize="words"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => void save()}
        error={tooLong ? "Names are at most 40 characters." : null}
      />
      <Txt variant="small">Friends still find you by your @username. You can change your name later in your profile.</Txt>
      {error ? (
        <Callout tone="danger" title="Couldn't save your name">
          {error}
        </Callout>
      ) : null}
    </Screen>
  );
}
