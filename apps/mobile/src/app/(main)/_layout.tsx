// Owner: Andy — main app navigator. Screens draw their own Primer title via <Screen>.
import { Stack } from "expo-router";
import { CalendarForegroundSync } from "../../features/calendar";
import { getToken } from "../../lib/api";
import { userIdFromToken } from "../../lib/session";

export default function MainLayout() {
  const userId = userIdFromToken(getToken());
  return <>
    {userId ? <CalendarForegroundSync key={userId} /> : null}
    <Stack screenOptions={{ headerShown: false }} />
  </>;
}
