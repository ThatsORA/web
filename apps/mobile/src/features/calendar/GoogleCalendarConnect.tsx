import { useState, useCallback, useEffect } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { View, Alert, ActivityIndicator } from "react-native";
import { Button, Txt, useTheme } from "../../ui";
import { GoogleCalendarStatusResponse, GoogleCalendarStartResponse } from "@web/contract";
import { api } from "../../lib/api";
import { z } from "zod";

WebBrowser.maybeCompleteAuthSession();

export function GoogleCalendarConnect() {
  const [status, setStatus] = useState<GoogleCalendarStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const theme = useTheme();

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api("/calendar/google", GoogleCalendarStatusResponse);
      setStatus(res);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleConnect = async () => {
    setLoading(true);
    try {
      const redirectUri = Linking.createURL("google-connected");
      const res = await api("/calendar/google/start", GoogleCalendarStartResponse, {
        method: "POST",
        body: { redirect_uri: redirectUri }
      });
      
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
      {status.connected ? (
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
