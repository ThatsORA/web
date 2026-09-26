// Owner: Andy — welcome screen: Primer hero band (violet frames, lime says "look here").
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useOnboardingNav } from "../../lib/useOnboardingNav";
import { Txt, useTheme } from "../../ui";

export default function Welcome() {
  const onDone = useOnboardingNav("welcome");
  const t = useTheme();
  const c = t.colors;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.primary }}>
      <View style={{ flex: 1, padding: t.spacing.lg, justifyContent: "flex-end", gap: t.spacing.md }}>
        <View
          style={{
            alignSelf: "flex-start",
            flexDirection: "row",
            borderRadius: t.radius.sm,
            overflow: "hidden",
          }}
        >
          <Txt variant="small" style={{ backgroundColor: c.lime, color: c.onLime, fontFamily: t.fonts.monoSemi, paddingHorizontal: t.spacing.sm, paddingVertical: 2 }}>
            NEW
          </Txt>
          <Txt variant="small" style={{ backgroundColor: c.primaryStrong, color: c.onPrimary, paddingHorizontal: t.spacing.sm, paddingVertical: 2 }}>
            Hangouts that plan themselves
          </Txt>
        </View>
        <Txt variant="display" accessibilityRole="header" style={{ color: c.onPrimary, fontSize: 64, lineHeight: 68 }}>
          Web
        </Txt>
        <Txt variant="body" style={{ color: c.onPrimary }}>
          Tell us when you're busy and who your close friends are. We'll find the time and the place.
        </Txt>
      </View>
      <View style={{ padding: t.spacing.lg }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Get started"
          onPress={onDone}
          style={({ pressed }) => ({
            minHeight: t.touch,
            justifyContent: "center",
            alignItems: "center",
            borderRadius: t.radius.md,
            backgroundColor: pressed ? c.primarySoft : "#FFFFFF",
          })}
        >
          <Txt variant="label" style={{ color: c.primary }}>
            Get started
          </Txt>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
