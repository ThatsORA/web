// Owner: Andy — main app navigator: bottom tabs (Hangouts / Friends / Squads / You).
// Screens draw their own Primer title via <Screen>, so tab headers are off.
// JS tabs (not native tabs) so the bar takes theme tokens and runs in Expo Go.
import { SymbolView } from "expo-symbols";
import { Tabs } from "expo-router/js-tabs";
import { CalendarForegroundSync } from "../../features/calendar";
import { getToken } from "../../lib/api";
import { HIDDEN_MAIN_ROUTES, MAIN_TABS } from "../../lib/mainTabs";
import { userIdFromToken } from "../../lib/session";
import { Txt, useTheme } from "../../ui";

export default function MainLayout() {
  const t = useTheme();
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
      {MAIN_TABS.map((tab) => (
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
      {HIDDEN_MAIN_ROUTES.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ href: null }} />
      ))}
    </Tabs>
  </>;
}
