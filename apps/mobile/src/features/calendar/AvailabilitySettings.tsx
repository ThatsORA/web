import React, { useState, useEffect } from "react";
import { View, ActivityIndicator, Alert } from "react-native";
import * as Location from "expo-location";
import { Txt, Button, Card, Modal, useTheme } from "../../ui";
import { Me, routes } from "@web/contract";
import type { z } from "zod";
import { api } from "../../lib/api";
import { roundedHome } from "../../lib/geo";
import { createDeviceCalendarSync, deviceTimezone } from "./device";
import { GoogleCalendarSyncButton } from "./GoogleCalendarConnect";
import { ManualAvailability } from "./ManualAvailability";
import { UnifiedCalendarView } from "./UnifiedCalendarView";


export function AvailabilitySettings() {
  const theme = useTheme();
  const [me, setMe] = useState<z.infer<typeof Me> | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [updatingLocation, setUpdatingLocation] = useState(false);
  const [scheduleKey, setScheduleKey] = useState(0);
  const [syncOpen, setSyncOpen] = useState(false);
  const refreshSchedule = () => setScheduleKey((k) => k + 1);

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
      const body = { ...roundedHome(position.coords), timezone: deviceTimezone() };
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
      setSyncOpen(false);
      refreshSchedule();
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

      <Card>
        <UnifiedCalendarView
          key={scheduleKey}
          userTimezone={me?.timezone ?? deviceTimezone()}
          onScheduleChanged={refreshSchedule}
          actions={
            <>
              <Button label="Sync" variant="outline" size="sm" onPress={() => setSyncOpen(true)} />
              <ManualAvailability onBlocksChanged={refreshSchedule} />
            </>
          }
        />
      </Card>

      <Modal visible={syncOpen} onClose={() => setSyncOpen(false)} title="Sync calendars">
        <Button
          label={syncing ? "Syncing..." : "Sync with device calendar"}
          variant="outline"
          onPress={handleSyncDeviceCalendar}
          disabled={syncing}
        />
        <GoogleCalendarSyncButton onSynced={() => { setSyncOpen(false); refreshSchedule(); }} />
      </Modal>
    </View>
  );
}

