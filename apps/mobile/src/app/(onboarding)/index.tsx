import { Link } from "expo-router";
import { Text, View } from "react-native";

export default function Welcome() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
      <Text style={{ fontSize: 32, fontWeight: "700" }}>Web</Text>
      <Text>Hangouts that plan themselves.</Text>
      <Link href="/(main)">Skip to app (dev)</Link>
    </View>
  );
}
