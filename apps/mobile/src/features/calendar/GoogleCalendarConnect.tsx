import { useState, useCallback, useEffect } from "react";
import { View, Alert, ActivityIndicator } from "react-native";
import { Button, Txt, useTheme } from "../../ui";
import { GoogleCalendarStatusResponse, GoogleCalendarStartResponse } from "@web/contract";
import { api } from "../../lib/api";

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
      const Linking = await import("expo-linking");
      const redirectUri = Linking.createURL("google-connected");
      const res = await api("/calendar/google/start", GoogleCalendarStartResponse, {
        method: "POST",
        body: { redirect_uri: redirectUri }
      });
      
      const WebBrowser = await import("expo-web-browser");
      const result = await WebBrowser.openAuthSessionAsync(res.url, redirectUri);
      
      if (result.type === "success" && result.url) {
        const parsed = Linking.parse(result.url);
        if (parsed.queryParams?.ok) {
          await fetchStatus();
        } else if (parsed.queryParams?.error) {
          Alert.alert("Connection Failed", String(parsed.queryParams.error));
        }
      }
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
    return <ActivityIndicator size="small" />;
  }

  return (
    <View style={{ marginVertical: theme.spacing.md }}>
      {status.revoked ? (
        <View style={{
          padding: theme.spacing.md,
          backgroundColor: theme.colors.surfaceMuted,
          borderRadius: theme.radius.md,
          gap: theme.spacing.sm,
        }}>
          <Txt variant="label" color="danger">Google Calendar Revoked</Txt>
          <Txt variant="small" color="textMuted">Your connection has expired or was revoked.</Txt>
          <Button 
            label="Reconnect Google Calendar" 
            onPress={handleConnect} 
            disabled={loading} 
          />
        </View>
      ) : status.connected ? (
        <View style={{
          padding: theme.spacing.md,
          backgroundColor: theme.colors.surfaceMuted,
          borderRadius: theme.radius.md,
          gap: theme.spacing.sm,
        }}>
          <Txt variant="label">Google Calendar Connected</Txt>
          {status.last_synced_at && (
            <Txt variant="small" color="textMuted">
              Last synced: {new Date(status.last_synced_at).toLocaleString()}
            </Txt>
          )}
          <Button 
            label="Disconnect Google Calendar" 
            onPress={handleDisconnect} 
            disabled={loading} 
            variant="secondary"
          />
        </View>
      ) : (
        <Button 
          label="Connect Google Calendar" 
          onPress={handleConnect} 
          disabled={loading} 
        />
      )}
    </View>
  );
}
