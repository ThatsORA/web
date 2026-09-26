// Owner: Andy — entry: restore the stored token, then resume where the account left off
// (location, close friends, or (main)), or start onboarding when there's no usable session.
import { Redirect, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { ApiError } from "../lib/api";
import { session } from "../lib/secureSession";
import { fetchResumeStep, RESUME_HREF } from "../lib/useOnboardingNav";
import { useTheme } from "../ui";

async function launchHref(): Promise<Href> {
  const token = await session.restore().catch(() => null);
  if (!token) return "/(onboarding)";
  try {
    return RESUME_HREF[await fetchResumeStep()];
  } catch (e) {
    // 401: token expired. 404: the account is gone (e.g. demo reset). Either way, start over.
    if (e instanceof ApiError && (e.status === 401 || e.status === 404)) {
      await session.clear();
      return "/(onboarding)";
    }
    return "/(main)"; // server unreachable: keep the signed-in user in the app
  }
}

export default function Index() {
  const t = useTheme();
  const [href, setHref] = useState<Href | null>(null);

  useEffect(() => {
    launchHref().then(setHref);
  }, []);

  if (href) return <Redirect href={href} />;
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: t.colors.background }}>
      <ActivityIndicator color={t.colors.primary} />
    </View>
  );
}
