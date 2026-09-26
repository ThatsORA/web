// Owner: Andy — welcome screen: Primer hero band (violet frames, lime says "look here").
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useOnboardingNav } from "../../lib/useOnboardingNav";
import { Badge, Button, Txt, useTheme } from "../../ui";

export default function Welcome() {
  const onDone = useOnboardingNav("welcome");
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.primary }}>
      <View style={{ flex: 1, padding: t.spacing.lg, justifyContent: "flex-end", gap: t.spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.sm }}>
          <Badge tone="new" label="New" />
          <Txt variant="small" color="onPrimary">
            Hangouts that plan themselves
          </Txt>
        </View>
        <Txt variant="hero" color="onPrimary" accessibilityRole="header">
          Web
        </Txt>
        <Txt variant="body" color="onPrimary">
          Tell us when you're busy and who your close friends are. We'll find the time and the place.
        </Txt>
      </View>
      <View style={{ padding: t.spacing.lg }}>
        <Button label="Get started" variant="onBrand" onPress={onDone} />
      </View>
    </SafeAreaView>
  );
}
