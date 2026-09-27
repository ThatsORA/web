import React, { useState, useEffect } from "react";
import { View, ActivityIndicator, Alert } from "react-native";
import * as Location from "expo-location";
import { Txt, Button, Card, useTheme } from "../../ui";
import { Me, routes } from "@web/contract";
import type { z } from "zod";
import { api } from "../../lib/api";
import { roundedHome } from "../../lib/geo";
import { createDeviceCalendarSync } from "./device";
import { GoogleCalendarConnect } from "./GoogleCalendarConnect";
import { ManualAvailability } from "./ManualAvailability";
import { UnifiedCalendarView } from "./UnifiedCalendarView";


export function AvailabilitySettings() {
  const theme = useTheme();
  const [me, setMe] = useState<z.infer<typeof Me> | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [updatingLocation, setUpdatingLocation] = useState(false);
  const [scheduleKey, setScheduleKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api(routes.me, Me)
      .then((user) => {
        if (!cancelled) {
          setMe(user);
          setLoadingMe(false);
        }
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) {
          setLoadingMe(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpdateLocation = async () => {
    setUpdatingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission denied", "Location permission is required to update home location.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const body = roundedHome(position.coords);
      const updated = await api(routes.me, Me, { method: "PATCH", body });
      setMe(updated);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to update location.");
    } finally {
      setUpdatingLocation(false);
    }
  };

  const handleSyncDeviceCalendar = async () => {
    setSyncing(true);
    try {
      await createDeviceCalendarSync().sync(true);
      Alert.alert("Success", "Device calendar synced successfully.");
      setScheduleKey((k) => k + 1);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to sync device calendar.");
    } finally {
      setSyncing(false);
    }
  };

  if (loadingMe && !me) {
    return <ActivityIndicator size="large" />;
  }

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <Card>
        <Txt variant="section">Home Location</Txt>
        <Txt variant="body" color="textMuted">
          {me?.home_lat !== null && me?.home_lng !== null
            ? `Lat: ${me?.home_lat}, Lng: ${me?.home_lng}`
            : "Not set"}
        </Txt>
        <Button
          label="Update to current location"
          variant="outline"
          onPress={handleUpdateLocation}
          disabled={updatingLocation}
        />
      </Card>

      {/* Consolidate Calendar & Availability Section */}
      <Card>
        <Txt variant="section">Calendar & Availability</Txt>
        <Txt variant="small" color="textMuted">
          Sync external calendars or enter manual busy times to highlight when you are free.
        </Txt>

        {/* Subtle Sync Controls Status Bar */}
        <View
          style={{
            backgroundColor: theme.colors.surfaceMuted,
            borderRadius: theme.radius.md,
            padding: theme.spacing.sm,
            gap: theme.spacing.sm,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          {/* Device Calendar Row */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: theme.spacing.xs,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.xs }}>
              <Txt variant="small" color="textMuted">
                Device Calendar:
              </Txt>
              <Txt variant="small" color="heading">
                Local Sync
              </Txt>
            </View>
            <Button
              label={syncing ? "Syncing..." : "Sync Device"}
              variant="outline"
              size="sm"
              onPress={handleSyncDeviceCalendar}
              disabled={syncing}
            />
          </View>

          <View style={{ height: 1, backgroundColor: theme.colors.border, opacity: 0.5 }} />

          {/* Google Calendar Row */}
          <GoogleCalendarConnect />
        </View>

        {/* Manual Availability */}
        <ManualAvailability onBlocksChanged={() => setScheduleKey((k) => k + 1)} />

        {/* Unified Schedule View */}
        <UnifiedCalendarView key={scheduleKey} onScheduleChanged={() => setScheduleKey((k) => k + 1)} />
      </Card>
    </View>
  );
}

