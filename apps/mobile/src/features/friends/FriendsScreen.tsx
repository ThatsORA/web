// Owner: Ojas — Friends tab screen: search, add and remove close friends after onboarding.
// Invariant: privacy — friend endpoints never reveal whether someone added you.
// Never show a mutual badge, a count, or an ordering by mutual.
import type { CloseFriend, UserSearchResult } from "@web/contract";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Callout, Card, Screen, Txt, useTheme } from "../../ui";
import { FriendSearch } from "./FriendSearch";
import { getCloseFriends, removeCloseFriend } from "./friendsApi";

export function FriendsScreen() {
  const t = useTheme();
  const [friends, setFriends] = useState<CloseFriend[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadFriends = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await getCloseFriends();
      setFriends(list);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadFriends);
  }, [loadFriends]);

  async function handleRefresh() {
    setRefreshing(true);
    setActionError(null);
    try {
      const list = await getCloseFriends();
      setFriends(list);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }

  async function handleRemove(userId: string) {
    setActionError(null);
    setRemovingId(userId);
    try {
      await removeCloseFriend(userId);
      setFriends((prev) => prev.filter((f) => f.id !== userId));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemovingId(null);
    }
  }

  function handleAdded(user: UserSearchResult) {
    setFriends((prev) => {
      if (prev.some((f) => f.id === user.id)) return prev;
      return [...prev, { id: user.id, username: user.username }];
    });
  }

  const addedIds = friends.map((f) => f.id);

  return (
    <Screen
      title="Friends"
      subtitle="Search by username to add close friends. Close friends are completely private — nobody is told, and you never see if they add you back."
    >
      <View style={{ gap: t.spacing.sm }}>
        <Txt variant="section">Add close friends</Txt>
        <FriendSearch addedIds={addedIds} onAdded={handleAdded} />
      </View>

      <View style={{ gap: t.spacing.sm, marginTop: t.spacing.md }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Txt variant="section">My close friends</Txt>
          <Button
            label={refreshing ? "Refreshing…" : "Refresh"}
            variant="ghost"
            onPress={() => void handleRefresh()}
            loading={refreshing}
          />
        </View>

        {actionError ? (
          <Callout tone="danger" title="Couldn't remove friend">
            {actionError}
          </Callout>
        ) : null}

        {loadError ? (
          <>
            <Callout tone="danger" title="Couldn't load close friends">
              {loadError}
            </Callout>
            <Button label="Try again" variant="secondary" onPress={() => void loadFriends()} />
          </>
        ) : null}

        {loading && friends.length === 0 ? (
          <Txt variant="body" color="textMuted">
            Loading close friends…
          </Txt>
        ) : null}

        {!loading && friends.length === 0 && !loadError ? (
          <Card tint>
            <Txt variant="small" color="textMuted">
              No close friends added yet. Search above to add someone.
            </Txt>
          </Card>
        ) : null}

        {friends.length > 0 ? (
          <View style={{ gap: t.spacing.sm }}>
            {friends.map((friend) => (
              <View
                key={friend.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: t.spacing.sm,
                  paddingVertical: t.spacing.xs,
                  borderBottomWidth: 1,
                  borderBottomColor: t.colors.border,
                }}
              >
                <Txt variant="body">@{friend.username}</Txt>
                <Button
                  label="Remove"
                  variant="ghost"
                  onPress={() => void handleRemove(friend.id)}
                  loading={removingId === friend.id}
                />
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
