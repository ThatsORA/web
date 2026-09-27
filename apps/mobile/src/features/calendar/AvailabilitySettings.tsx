import React, { useState, useEffect } from "react";
import { View, ActivityIndicator, Alert } from "react-native";
import * as Location from "expo-location";
import { Txt, Button, useTheme } from "../../ui";
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
    <View style={{ gap: theme.spacing.xl, paddingVertical: theme.spacing.sm }}>
      <View style={{ gap: theme.spacing.md }}>
        <Txt variant="title">Home Location</Txt>
        <Txt variant="body" color="textMuted">
          {me?.home_lat !== null && me?.home_lng !== null
            ? `Lat: ${me?.home_lat}, Lng: ${me?.home_lng}`
            : "Not set"}
        </Txt>
        <Button
          label="Update to current location"
          onPress={handleUpdateLocation}
          disabled={updatingLocation}
        />
      </View>

      <View style={{ gap: theme.spacing.md }}>
        <Txt variant="title">Calendar Sources</Txt>
        <Button
          label="Sync Device Calendar Now"
          onPress={handleSyncDeviceCalendar}
          disabled={syncing}
        />
        <GoogleCalendarConnect />
      </View>

      <ManualAvailability />

      <UnifiedCalendarView />
    </View>
  );
}

