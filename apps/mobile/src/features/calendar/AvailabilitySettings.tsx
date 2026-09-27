import React, { useState, useEffect } from "react";
import { View, ActivityIndicator, Alert } from "react-native";
import * as Location from "expo-location";
import { Txt, Button, useTheme } from "../../ui";
import { Me, routes, TravelMode } from "@web/contract";
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
  const [updatingMode, setUpdatingMode] = useState<string | null>(null);

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

  const handleUpdateTravelMode = async (mode: z.infer<typeof TravelMode>) => {
    if (me?.travel_mode === mode) return;
    setUpdatingMode(mode);
    try {
      const updated = await api(routes.me, Me, { method: "PATCH", body: { travel_mode: mode } });
      setMe(updated);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to update travel mode.");
    } finally {
      setUpdatingMode(null);
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

  const travelModes: z.infer<typeof TravelMode>[] = ["DRIVE", "TRANSIT", "WALK", "BICYCLE"];

  return (
    <View style={{ gap: theme.spacing.lg, padding: theme.spacing.md }}>
      <View style={{ gap: theme.spacing.sm }}>
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

      <View style={{ gap: theme.spacing.sm }}>
        <Txt variant="title">Travel Mode</Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          {travelModes.map((mode) => (
            <Button
              key={mode}
              label={mode}
              variant={me?.travel_mode === mode ? "primary" : "secondary"}
              onPress={() => handleUpdateTravelMode(mode)}
              disabled={updatingMode !== null}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
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

