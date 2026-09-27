// Owner: Andy (built for Ojas's #310) — private matching profile: what you enjoy and what kind of person you are.
// Opened from the You tab, never a bottom tab. Only the owner and the decision model ever see these fields.
// The Budget section (#324) is private too: typical spend per person and how often, per kind of outing.
import { Me, PatchMeRequest, SpendCategory, SpendOften, routes } from "@web/contract";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import type { z } from "zod";
import { api } from "../../lib/api";
import {
  OFTEN_LABELS,
  PREF_MAX,
  SPEND_LABELS,
  budgetDraft,
  buildBudget,
  buildPrefsPatch,
  profileErrorMessage,
  type BudgetDraft,
} from "../../lib/profile";
import { Button, Callout, Card, Chip, Screen, TextField, Txt, useTheme } from "../../ui";

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

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(main)/you");
    }
  };

  return (
    <Screen
      title="Preferences"
      headerRight={<Button label="← Back" variant="ghost" onPress={handleBack} />}
    >
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
  const [draft, setDraft] = useState(() => budgetDraft(me.budget));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { budget, errors: budgetErrors } = buildBudget(draft);
  const patch = Object.keys(budgetErrors).length ? null : buildPrefsPatch(me, { activities, personality, budget });
  const t = useTheme();

  function setRow(category: SpendCategory, row: Partial<BudgetDraft[SpendCategory]>) {
    setDraft((d) => ({ ...d, [category]: { ...d[category], ...row } }));
    setSaved(false);
  }

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
      <Txt variant="section">Budget</Txt>
      <Txt variant="small">What you usually spend per person, and how often. All optional.</Txt>
      {SpendCategory.options.map((category) => (
        <View key={category} style={{ gap: t.spacing.sm }}>
          <TextField
            label={`${SPEND_LABELS[category]} ($ per person)`}
            value={draft[category].spend}
            onChangeText={(spend) => setRow(category, { spend })}
            placeholder="e.g. 25"
            keyboardType="number-pad"
            maxLength={3}
            error={budgetErrors[category]}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm }}>
            {SpendOften.options.map((often) => (
              <Chip
                key={often}
                label={OFTEN_LABELS[often]}
                selected={draft[category].often === often}
                onPress={() => setRow(category, { often: draft[category].often === often ? null : often })}
              />
            ))}
          </View>
        </View>
      ))}
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
