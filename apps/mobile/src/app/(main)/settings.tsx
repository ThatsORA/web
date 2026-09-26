// Owner: Andy — Settings screen (profile, favorites, log out, and mount points for Riley & Ojas).
import { Me, routes } from "@web/contract";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { api } from "../../lib/api";
import { session } from "../../lib/secureSession";
import { AvailabilitySettings } from "../../features/calendar";
import { FavoritesSettings } from "../../features/favorites";
import { CloseFriendsSettings } from "../../features/friends";
import { Button, Callout, Card, Screen, TextField, Txt } from "../../ui";

type MeData = z.infer<typeof Me>;

export default function Settings() {
  const [me, setMe] = useState<MeData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await api(routes.me, Me);
      setMe(data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadProfile);
  }, [loadProfile]);

  async function logOut() {
    setLoggingOut(true);
    setLogoutError(false);
    try {
      await session.clear();
      router.replace("/(onboarding)/signup");
    } catch {
      setLogoutError(true);
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <Screen title="Settings">
      {/* Section 1: Profile (username, email read-only) */}
      <Card>
        <Txt variant="section">Profile</Txt>
        {loadError ? (
          <>
            <Callout tone="danger" title="Couldn't load profile">
              {loadError}
            </Callout>
            <Button label="Try again" variant="secondary" onPress={() => void loadProfile()} />
          </>
        ) : (
          <>
            <TextField label="Username" value={me?.username ? `@${me.username}` : ""} editable={false} />
            <TextField label="Email" value={me?.email ?? ""} editable={false} />
          </>
        )}
      </Card>

      {/* Section 2: Favorites */}
      <FavoritesSettings />

      {/* Section 3: Availability Settings mount point (Riley) if available */}
      {AvailabilitySettings ? <AvailabilitySettings /> : null}

      {/* Section 4: Close Friends Settings mount point (Ojas) if available */}
      {CloseFriendsSettings ? <CloseFriendsSettings /> : null}

      {/* Section 5: Log out */}
      <Card>
        <Txt variant="section">Account</Txt>
        {logoutError ? (
          <Callout tone="danger" title="Couldn't log out">
            Please try again.
          </Callout>
        ) : null}
        <Button label="Log out" variant="outline" onPress={() => void logOut()} loading={loggingOut} />
      </Card>
    </Screen>
  );
}
