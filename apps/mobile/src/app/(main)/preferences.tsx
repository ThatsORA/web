// Owner: Andy (built for Ojas's #310) — private matching profile: what you enjoy and what kind of person you are.
// Opened from the You tab, never a bottom tab. Only the owner and the decision model ever see these fields.
import { Me, PatchMeRequest, routes } from "@web/contract";
import { useCallback, useEffect, useState } from "react";
import type { z } from "zod";
import { api } from "../../lib/api";
import { PREF_MAX, buildPrefsPatch, profileErrorMessage } from "../../lib/profile";
import { Button, Callout, Card, Screen, TextField, Txt } from "../../ui";

type MeData = z.infer<typeof Me>;

export default function Preferences() {
  const [me, setMe] = useState<MeData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setMe(await api(routes.me, Me));
    } catch (e) {
      setLoadError(profileErrorMessage(e));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  return (
    <Screen title="Preferences">
      {loadError ? (
        <>
          <Callout tone="danger" title="Couldn't load your preferences">
            {loadError}
          </Callout>
          <Button label="Try again" variant="secondary" onPress={() => void load()} />
        </>
      ) : null}
      {me ? <PrefsForm me={me} onSaved={setMe} /> : null}
    </Screen>
  );
}

function PrefsForm({ me, onSaved }: { me: MeData; onSaved: (me: MeData) => void }) {
  const [activities, setActivities] = useState(me.pref_activities ?? "");
  const [personality, setPersonality] = useState(me.pref_personality ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const patch = buildPrefsPatch(me, { activities, personality });

  async function save() {
    if (!patch) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(await api(routes.me, Me, { method: "PATCH", body: PatchMeRequest.parse(patch) }));
      setSaved(true);
    } catch (e) {
      setError(profileErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <Txt variant="small">Only used to suggest plans. Friends never see this.</Txt>
      <TextField
        label="What do you enjoy doing?"
        value={activities}
        onChangeText={(v) => {
          setActivities(v);
          setSaved(false);
        }}
        placeholder="bouldering, board games, trying new ramen spots, sunset walks"
        autoCapitalize="sentences"
        multiline
        maxLength={PREF_MAX}
      />
      <Txt variant="small" numeric>
        {activities.trim().length} / {PREF_MAX}
      </Txt>
      <TextField
        label="What kind of person are you?"
        value={personality}
        onChangeText={(v) => {
          setPersonality(v);
          setSaved(false);
        }}
        placeholder="introvert, prefer small groups, early bird, up for anything outdoors"
        autoCapitalize="sentences"
        multiline
        maxLength={PREF_MAX}
      />
      <Txt variant="small" numeric>
        {personality.trim().length} / {PREF_MAX}
      </Txt>
      {error ? (
        <Callout tone="danger" title="Couldn't save">
          {error}
        </Callout>
      ) : null}
      {saved ? <Callout tone="success">Saved.</Callout> : null}
      <Button label="Save" onPress={() => void save()} loading={saving} disabled={!patch} />
    </Card>
  );
}
