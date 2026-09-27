// Owner: Andy — You tab: user profile, settings (favorites, availability, close friends), and Log out.
import { Me, routes } from "@web/contract";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, View } from "react-native";
import type { z } from "zod";
import { api } from "../../lib/api";
import { displayName } from "../../lib/displayName";
import { unregisterPushToken } from "../../lib/push";
import { PREFERENCES_HREF, PROFILE_HREF } from "../../lib/routes";
import { session } from "../../lib/secureSession";
import { AvailabilitySettings } from "../../features/calendar";
import { FavoritesSettings } from "../../features/favorites";
import { CloseFriendsSettings } from "../../features/friends";
import { Button, Callout, Card, Screen, Txt, useTheme } from "../../ui";

export default function You() {
  const t = useTheme();
  const [me, setMe] = useState<z.infer<typeof Me> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setMe(await api(routes.me, Me));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
      setSettingsVersion((version) => version + 1);
    } finally {
      setRefreshing(false);
    }
  }

  // Replace, not push: back can't return to (main) once the session is gone (#54).
  async function logOut() {
    setLoggingOut(true);
    setLogoutError(false);
    try {
      void unregisterPushToken(); // start it before clear(): it sends with this session
      await session.clear();
      router.replace("/(onboarding)/signup");
    } catch {
      setLogoutError(true);
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <Screen
      title="You"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          tintColor={t.colors.primary}
          colors={[t.colors.primary]}
          progressBackgroundColor={t.colors.surface}
        />
      }
    >
      <View style={{ gap: t.spacing.xl }}>
        {loadError ? (
          <View style={{ gap: t.spacing.sm }}>
            <Callout tone="danger" title="Couldn't load your account">
              {loadError}
            </Callout>
            <Button label="Try again" variant="secondary" onPress={() => void load()} />
          </View>
        ) : null}

        {me ? (
          <Card>
            <Txt variant="eyebrow">Signed in as</Txt>
            <Txt variant="section">{displayName(me)}</Txt>
            <Txt variant="small">@{me.username}</Txt>
            {me.email ? <Txt variant="small" color="textMuted">{me.email}</Txt> : null}
            <Button label="Edit profile" variant="outline" onPress={() => router.push(PROFILE_HREF)} />
            <Button label="Preferences" variant="outline" onPress={() => router.push(PREFERENCES_HREF)} />
          </Card>
        ) : null}

        {/* Section: Favorites */}
        <FavoritesSettings key={`favorites-${settingsVersion}`} />

        {/* Section: Availability Settings mount point (Riley) */}
        {AvailabilitySettings ? <AvailabilitySettings key={`availability-${settingsVersion}`} /> : null}

        {/* Section: Close Friends Settings mount point (Ojas) */}
        {CloseFriendsSettings ? <CloseFriendsSettings key={`close-friends-${settingsVersion}`} /> : null}

        {/* Section: Account & Log out */}
        <Card>
          <Txt variant="section">Account</Txt>
          {logoutError ? (
            <Callout tone="danger" title="Couldn't log out">
              Try again.
            </Callout>
          ) : null}
          <Button label="Log out" variant="outline" onPress={() => void logOut()} loading={loggingOut} />
        </Card>
      </View>
    </Screen>
  );
}

