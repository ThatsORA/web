// Owner: Andy — Settings section: quick-tap favorite categories → PUT /favorites.
import { PutFavoritesRequest, routes } from "@web/contract";
import { useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import { api } from "../../lib/api";
import { Button, Callout, Card, Chip, Txt, useTheme } from "../../ui";
import { FAVORITE_CATEGORIES, toggleCategory } from "./categories";

const PutFavoritesResponse = z.unknown();

export function FavoritesSettings() {
  const t = useTheme();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const body = PutFavoritesRequest.parse({ categories: selected });
      await api(routes.favorites, PutFavoritesResponse, { method: "PUT", body });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save favorites");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <Txt variant="section">Favorites</Txt>
      <Txt variant="small" color="textMuted">
        Tap categories you like. We&apos;ll lean toward these when picking places.
      </Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm }}>
        {FAVORITE_CATEGORIES.map((c) => (
          <Chip
            key={c.value}
            label={c.label}
            selected={selected.includes(c.value)}
            onPress={() => {
              setSaved(false);
              setSelected((s) => toggleCategory(s, c.value));
            }}
          />
        ))}
      </View>
      {saved ? (
        <Callout tone="info" title="Favorites saved">
          Your preferences have been updated.
        </Callout>
      ) : null}
      {error ? (
        <Callout tone="danger" title="Couldn't save favorites">
          {error}
        </Callout>
      ) : null}
      <Button label="Save favorites" variant="secondary" onPress={() => void save()} loading={saving} />
    </Card>
  );
}
