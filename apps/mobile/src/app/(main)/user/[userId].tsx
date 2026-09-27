// Owner: Andy — someone's public profile (#97 part 2): avatar, name, bio, shared squads and the friend button.
// Link here with router.push(profileHref(id)) from lib/routes.
// Privacy: renders PublicProfile only (never email), and never shows close-friend status.
import { PublicProfile, routes } from "@web/contract";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, View } from "react-native";
import type { z } from "zod";
import { deleteFriendRequest, getFriendRequests, sendFriendRequest } from "../../../features/friends";
import { api, getToken } from "../../../lib/api";
import { friendAction, type FriendAction } from "../../../lib/friendAction";
import { userIdFromToken } from "../../../lib/session";
import { Avatar, Badge, Button, Callout, Card, Screen, Txt, useTheme } from "../../../ui";

export default function UserProfileRoute() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  // Keyed so opening a different person never shows the last one's profile or acts on them.
  return <UserProfile key={userId} userId={userId} />;
}

function UserProfile({ userId }: { userId: string }) {
  const t = useTheme();
  const [profile, setProfile] = useState<z.infer<typeof PublicProfile> | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setProfile(await api(routes.user(userId), PublicProfile));
    } catch {
      setLoadError(true);
    }
  }, [userId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  async function act(kind: FriendAction["kind"]) {
    if (!profile) return;
    setBusy(true);
    setActionError(false);
    try {
      if (kind === "send") {
        // Accepting is a send too: the server accepts when they've already asked me.
        const { status } = await sendFriendRequest(profile.username);
        setProfile({ ...profile, friendship: status });
      } else {
        // The profile has no request id, so find my outgoing request to them.
        const { outgoing } = await getFriendRequests();
        const request = outgoing.find((r) => r.user.id === profile.id);
        if (request) await deleteFriendRequest(request.id);
        setProfile({ ...profile, friendship: "none" });
      }
    } catch {
      setActionError(true);
    } finally {
      setBusy(false);
    }
  }

  const action = profile ? friendAction(profile.friendship, userIdFromToken(getToken()) === profile.id) : null;

  return (
    <Screen
      eyebrow="Profile"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          tintColor={t.colors.primary}
          colors={[t.colors.primary]}
          progressBackgroundColor={t.colors.surface}
        />
      }
      footer={
        <>
          {action ? <Button label={action.label} variant={action.variant} loading={busy} onPress={() => void act(action.kind)} /> : null}
          <Button label="Back" variant="ghost" onPress={() => router.back()} />
        </>
      }
    >
      {profile ? (
        <>
          <View style={{ gap: t.spacing.sm }}>
            <Avatar name={profile.display_name} size="lg" />
            <Txt variant="display" accessibilityRole="header">
              {profile.display_name}
            </Txt>
            <Txt variant="label" color="textMuted">
              @{profile.username}
            </Txt>
            {profile.friendship === "friends" ? <Badge label="Friends" tone="success" /> : null}
          </View>
          {profile.bio ? <Txt variant="body">{profile.bio}</Txt> : null}
          {profile.squads.length > 0 ? (
            <Card>
              <Txt variant="eyebrow">Squads you share</Txt>
              {profile.squads.map((squad) => (
                <Txt key={squad.id} variant="label">
                  {squad.name}
                </Txt>
              ))}
            </Card>
          ) : null}
          {actionError ? (
            <Callout tone="danger" title="That didn't go through">
              Try again.
            </Callout>
          ) : null}
        </>
      ) : null}
      {loadError ? (
        <>
          <Callout tone="danger" title="Couldn't load this profile">
            Check your connection and try again.
          </Callout>
          <Button label="Try again" variant="secondary" onPress={() => void load()} />
        </>
      ) : null}
    </Screen>
  );
}
