// Owner: Andy — You tab: who's signed in, and Log out.
// Settings (#75) and Profile (#97) land here later.
import { Me, routes } from "@web/contract";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { unregisterPushToken } from "../../lib/push";
import { session } from "../../lib/secureSession";
import { Button, Callout, Card, Screen, Txt } from "../../ui";

export default function You() {
  const [username, setUsername] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const me = await api(routes.me, Me);
      setUsername(me.username);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

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
      footer={<Button label="Log out" variant="ghost" onPress={() => void logOut()} loading={loggingOut} />}
    >
      {logoutError ? (
        <Callout tone="danger" title="Couldn't log out">
          Try again.
        </Callout>
      ) : null}
      {username ? (
        <Card>
          <Txt variant="eyebrow">Signed in as</Txt>
          <Txt variant="section">@{username}</Txt>
        </Card>
      ) : null}
      {loadError ? (
        <>
          <Callout tone="danger" title="Couldn't load your account">
            {loadError}
          </Callout>
          <Button label="Try again" variant="secondary" onPress={() => void load()} />
        </>
      ) : null}
    </Screen>
  );
}
