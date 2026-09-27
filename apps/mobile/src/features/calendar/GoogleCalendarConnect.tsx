import { useState, useCallback, useEffect } from "react";
import { View, Alert, ActivityIndicator } from "react-native";
import { Button, Txt, useTheme } from "../../ui";
import { GoogleCalendarStatusResponse, GoogleCalendarStartResponse, routes } from "@web/contract";
import { api } from "../../lib/api";
import { z } from "zod";


/** Runs Google's sign-in and consent in a browser session. True once the server has stored the connection. */
async function connectGoogleCalendar(): Promise<boolean> {
  const Linking = await import("expo-linking");
  const redirectUri = Linking.createURL("google-connected");
  const res = await api("/calendar/google/start", GoogleCalendarStartResponse, {
    method: "POST",
    body: { redirect_uri: redirectUri }
  });

  const WebBrowser = await import("expo-web-browser");
  const result = await WebBrowser.openAuthSessionAsync(res.url, redirectUri);

  if (result.type !== "success" || !result.url) return false;
  const parsed = Linking.parse(result.url);
  if (parsed.queryParams?.error) {
    Alert.alert("Connection Failed", String(parsed.queryParams.error));
    return false;
  }
  return Boolean(parsed.queryParams?.ok);
}

/**
 * One button for the You tab's sync modal: connects Google Calendar the first time (or after access was revoked),
 * otherwise pulls its busy times now. `onSynced` runs after either, so the schedule can refresh.
 */
export function GoogleCalendarSyncButton({ onSynced }: { onSynced?: () => void }) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void import("expo-web-browser").then(wb => wb.maybeCompleteAuthSession()).catch(() => {});
  }, []);

  const handlePress = async () => {
    setLoading(true);
    try {
      const status = await api(routes.googleCalendar, GoogleCalendarStatusResponse);
      if ((!status.connected || status.revoked) && !(await connectGoogleCalendar())) return;
      await api(routes.googleCalendarSync, z.unknown(), { method: "POST" });
      onSynced?.();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Google Calendar sync failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      label={loading ? "Syncing..." : "Sync with Google Calendar"}
      variant="outline"
      onPress={() => void handlePress()}
      disabled={loading}
    />
  );
}

export function GoogleCalendarConnect() {
  const [status, setStatus] = useState<GoogleCalendarStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const theme = useTheme();

  useEffect(() => {
    void import("expo-web-browser").then(wb => wb.maybeCompleteAuthSession()).catch(() => {});
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api("/calendar/google", GoogleCalendarStatusResponse);
      setStatus(res);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api("/calendar/google", GoogleCalendarStatusResponse)
      .then((res) => {
        if (!cancelled) setStatus(res);
      })
      .catch((e) => {
        console.error(e);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleConnect = async () => {
    setLoading(true);
    try {
      if (await connectGoogleCalendar()) await fetchStatus();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await api("/calendar/google", z.object({ success: z.boolean() }), { method: "DELETE" });
      setStatus({ connected: false, last_synced_at: null });
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Disconnection failed");
    } finally {
      setLoading(false);
    }
  };

  if (!status) {
    return (
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Txt variant="small" color="textMuted">Google Calendar: Checking status...</Txt>
        <ActivityIndicator size="small" />
      </View>
    );
  }

  const isConnected = status.connected;
  const isRevoked = status.revoked;

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: theme.spacing.xs,
      }}
    >
      <View style={{ flex: 1, minWidth: 140 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.xs }}>
          <Txt variant="small" color="textMuted">
            Google Calendar:
          </Txt>
          <Txt
            variant="small"
            color={isRevoked ? "danger" : isConnected ? "heading" : "textMuted"}
          >
            {isRevoked ? "Revoked" : isConnected ? "Connected" : "Not connected"}
          </Txt>
        </View>
        {isConnected && status.last_synced_at ? (
          <Txt variant="small" color="textMuted" numeric>
            Last synced: {new Date(status.last_synced_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </Txt>
        ) : null}
      </View>
      <Button
        label={isRevoked ? "Reconnect" : isConnected ? "Disconnect" : "Connect"}
        variant="outline"
        size="sm"
        onPress={isRevoked || !isConnected ? handleConnect : handleDisconnect}
        disabled={loading}
        loading={loading}
      />
    </View>
  );
}
