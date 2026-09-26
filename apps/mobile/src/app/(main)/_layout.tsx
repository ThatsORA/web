// Owner: Andy — main app navigator: bottom tabs (Hangouts / Friends / Squads / You).
// Screens draw their own Primer title via <Screen>, so tab headers are off.
// JS tabs (not native tabs) so the bar takes theme tokens and runs in Expo Go.
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Tabs } from "expo-router/js-tabs";
import { CalendarForegroundSync } from "../../features/calendar";
import { useSessionSocket } from "../../features/event-card";
import { getToken } from "../../lib/api";
import { userIdFromToken } from "../../lib/session";
import { Txt, useTheme } from "../../ui";

// `name` is the route file in this folder; other lanes link to these (e.g. /(main)/friends). First = initial tab.
// Icons: SF Symbol on iOS, Material Symbol on Android/web (expo-symbols ships in Expo Go).
const TABS: { name: string; title: string; icon: SymbolViewProps["name"] }[] = [
  { name: "index", title: "Hangouts", icon: { ios: "calendar", android: "calendar_month", web: "calendar_month" } },
  { name: "friends", title: "Friends", icon: { ios: "person.2", android: "group", web: "group" } },
  { name: "squads", title: "Squads", icon: { ios: "person.3", android: "groups", web: "groups" } },
  { name: "you", title: "You", icon: { ios: "person.crop.circle", android: "account_circle", web: "account_circle" } },
];

export default function MainLayout() {
  const t = useTheme();
  useSessionSocket(); // the app's one socket lives here so every tab (Hangouts, Friends) can listen
  const userId = userIdFromToken(getToken());
  return <>
    {userId ? <CalendarForegroundSync key={userId} /> : null}
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: t.colors.background },
        tabBarActiveTintColor: t.colors.link,
        tabBarInactiveTintColor: t.colors.textMuted,
        tabBarStyle: { backgroundColor: t.colors.background, borderTopColor: t.colors.border, borderTopWidth: 1 },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarLabel: ({ focused, children }) => (
              <Txt variant="small" color={focused ? "link" : "textMuted"}>
                {children}
              </Txt>
            ),
            tabBarIcon: ({ color, size }) => <SymbolView name={tab.icon} tintColor={color} size={size} />,
          }}
        />
      ))}
      {/* Dev gallery: still a route (linked from the feed in __DEV__ only), never a tab. */}
      <Tabs.Screen name="card-states" options={{ href: null }} />
    </Tabs>
  </>;
}
