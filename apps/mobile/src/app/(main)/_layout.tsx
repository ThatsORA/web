// Owner: Andy — main app navigator. Screens draw their own Primer title via <Screen>.
import { Stack } from "expo-router";

export default function MainLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
