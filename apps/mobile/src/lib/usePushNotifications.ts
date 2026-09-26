// Owner: Andy — push notifications (#79), mounted by the signed-in (main) layout, so the
// permission prompt comes after onboarding, never at launch. A denial is silent.
// expo-notifications is loaded lazily: in Expo Go even importing it logs a warning, and push is off there.
import Constants from "expo-constants";
import { isRunningInExpoGo } from "expo";
import type { NotificationResponse } from "expo-notifications"; // type only: erased, loads nothing
import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { feedHrefForPush, pushSkipReason, savePushToken } from "./push";

export function usePushNotifications() {
  useEffect(() => {
    const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
    const skip = pushSkipReason({ os: Platform.OS, inExpoGo: isRunningInExpoGo(), projectId });
    if (skip) {
      if (__DEV__) console.log(`Push notifications off: ${skip} (see wiki/mobile.md)`);
      return;
    }
    const platform = Platform.OS === "ios" ? "ios" : "android";
    let cancelled = false;
    let tapSubscription: { remove(): void } | undefined;

    void (async () => {
      const Notifications = await import("expo-notifications");
      if (cancelled) return;

      // Tap → Hangouts feed at that event. The last response covers a tap that cold-started the app.
      const open = (response: NotificationResponse | null) => {
        if (response?.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
        Notifications.clearLastNotificationResponse(); // don't reopen it on the next (main) mount
        router.navigate(feedHrefForPush(response.notification.request.content.data));
      };
      open(Notifications.getLastNotificationResponse());
      tapSubscription = Notifications.addNotificationResponseReceivedListener(open);

      // Android 13+ shows the permission prompt only once a channel exists.
      if (platform === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Hangouts",
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
      let permission = await Notifications.getPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
      if (!permission.granted || cancelled) return;
      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
      if (!cancelled) await savePushToken(token, platform);
    })().catch((e: unknown) => {
      // Push is a nice-to-have: sockets still update the open app.
      if (__DEV__) console.log("Push registration failed", e);
    });

    return () => {
      cancelled = true;
      tapSubscription?.remove();
    };
  }, []);
}
