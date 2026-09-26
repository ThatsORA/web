// Owner: Andy — onboarding step 3: quick-tap favorites → PUT /favorites.
import { PutFavoritesRequest, routes } from "@web/contract";
import { useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import { api } from "../../lib/api";
import { stepEyebrow, type OnboardingStepProps } from "../../lib/onboarding";
import { Button, Callout, Chip, Screen, useTheme } from "../../ui";
import { FAVORITE_CATEGORIES, toggleCategory } from "./categories";

// The contract defines no PUT /favorites response body, so accept anything on success.
const PutFavoritesResponse = z.unknown();

export function FavoritesStep({ onDone }: OnboardingStepProps) {
  const t = useTheme();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = PutFavoritesRequest.parse({ categories: selected });
      await api(routes.favorites, PutFavoritesResponse, { method: "PUT", body });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      eyebrow={stepEyebrow("favorites")}
      title="What do you like?"
      subtitle="Tap a few. We'll lean toward these when picking places."
      footer={
        <>
          <Button label="Continue" onPress={save} loading={saving} disabled={selected.length === 0} />
          {error ? <Button label="Skip for now" variant="ghost" onPress={onDone} /> : null}
        </>
      }
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm }}>
        {FAVORITE_CATEGORIES.map((c) => (
          <Chip
            key={c.value}
            label={c.label}
            selected={selected.includes(c.value)}
            onPress={() => setSelected((s) => toggleCategory(s, c.value))}
          />
        ))}
      </View>
      {error ? (
        <Callout tone="danger" title="Couldn't save favorites">
          {error}
        </Callout>
      ) : null}
    </Screen>
  );
}
