// Owner: Andy — Settings section: quick-tap favorite categories → PUT /favorites.
import { GetFavoritesResponse, PutFavoritesRequest, routes } from "@web/contract";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { z } from "zod";
import { api } from "../../lib/api";
import { Button, Callout, Card, Chip, Txt, useTheme } from "../../ui";
import { FAVORITE_CATEGORIES, toggleCategory } from "./categories";

const PutFavoritesResponse = z.unknown();

export type FavoritesSettingsViewProps = {
  selected: string[];
  loading: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
  onToggle: (category: string) => void;
  onSave: () => void;
};

export function FavoritesSettingsView({
  selected,
  loading,
  saving,
  saved,
  error,
  onToggle,
  onSave,
}: FavoritesSettingsViewProps) {
  const t = useTheme();
  return (
    <Card>
      <Txt variant="section">Favorites</Txt>
      <Txt variant="small" color="textMuted">
        Tap categories you like. We&apos;ll lean toward these when picking places.
      </Txt>
      {loading ? (
        <ActivityIndicator size="small" color={t.colors.primary} />
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm }}>
          {FAVORITE_CATEGORIES.map((c) => (
            <Chip
              key={c.value}
              label={c.label}
              selected={selected.includes(c.value)}
              onPress={() => onToggle(c.value)}
            />
          ))}
        </View>
      )}
      {saved ? (
        <Callout tone="info" title="Favorites saved">
          Your preferences have been updated.
        </Callout>
      ) : null}
      {error ? (
        <Callout tone="danger" title={loading ? "Couldn't load favorites" : "Couldn't save favorites"}>
          {error}
        </Callout>
      ) : null}
      <Button label="Save favorites" variant="secondary" onPress={onSave} loading={saving} disabled={loading} />
    </Card>
  );
}

export function FavoritesSettings() {
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await api(routes.favorites, GetFavoritesResponse);
        if (active) setSelected(data.categories);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load favorites");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

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

  function handleToggle(value: string) {
    setSaved(false);
    setSelected((s) => toggleCategory(s, value));
  }

  return (
    <FavoritesSettingsView
      selected={selected}
      loading={loading}
      saving={saving}
      saved={saved}
      error={error}
      onToggle={handleToggle}
      onSave={() => void save()}
    />
  );
}
