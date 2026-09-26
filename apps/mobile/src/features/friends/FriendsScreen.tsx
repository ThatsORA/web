// Owner: Ojas — Friends tab screen: search, friend requests inbox, friends list, and close-friend star toggle.
// Invariant: privacy — close-friend star status is never revealed to the other person.
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useFriendEvents } from "../event-card";
import { Button, Callout, Card, Chip, Screen, Txt, useTheme } from "../../ui";
import { FriendSearch } from "./FriendSearch";
import { RequestsInbox } from "./RequestsInbox";
import {
  getFriendRequests,
  getFriends,
  starCloseFriend,
  unfriend,
  unstarCloseFriend,
  type Friend,
  type FriendRequestsResponse,
} from "./friendsApi";

export function FriendsScreen() {
  const t = useTheme();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequestsResponse>({ incoming: [], outgoing: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyUnfriend, setBusyUnfriend] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    setLoadError(null);
    try {
      const [friendsList, reqs] = await Promise.all([getFriends(), getFriendRequests()]);
      setFriends(friendsList);
      setRequests(reqs);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  // Live friend:request / friend:accepted on the session socket; also refreshes the inbox.
  useFriendEvents(() => void loadData());

  async function handleRefresh() {
    setRefreshing(true);
    setActionError(null);
    await loadData();
  }

  async function handleToggleClose(f: Friend) {
    setActionError(null);
    const nextClose = !f.close;
    // Optimistic update
    setFriends((prev) => prev.map((item) => (item.id === f.id ? { ...item, close: nextClose } : item)));
    try {
      if (nextClose) {
        await starCloseFriend(f.username);
      } else {
        await unstarCloseFriend(f.id);
      }
    } catch (e) {
      // Revert on error
      setFriends((prev) => prev.map((item) => (item.id === f.id ? { ...item, close: f.close } : item)));
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleUnfriend(userId: string) {
    setActionError(null);
    setBusyUnfriend((prev) => ({ ...prev, [userId]: true }));
    try {
      await unfriend(userId);
      setFriends((prev) => prev.filter((item) => item.id !== userId));
      await loadData();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyUnfriend((prev) => ({ ...prev, [userId]: false }));
    }
  }

  return (
    <Screen
      title="Friends"
      subtitle="Connect with friends and star your close friends. Close friends are completely private — nobody is told, and you never see if they star you."
    >
      {/* Requests Inbox */}
      <RequestsInbox requests={requests} onRefresh={() => void handleRefresh()} />

      {/* Search & Add Section */}
      <View style={{ gap: t.spacing.sm, marginTop: t.spacing.xs }}>
        <Txt variant="section">Find people</Txt>
        <FriendSearch friends={friends} requests={requests} onRefresh={() => void handleRefresh()} />
      </View>

      {/* Friends List Section */}
      <View style={{ gap: t.spacing.sm, marginTop: t.spacing.md }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Txt variant="section">Friends ({friends.length})</Txt>
          <Button
            label={refreshing ? "Refreshing…" : "Refresh"}
            variant="ghost"
            onPress={() => void handleRefresh()}
            loading={refreshing}
          />
        </View>

        {actionError ? (
          <Callout tone="danger" title="Something went wrong">
            {actionError}
          </Callout>
        ) : null}

        {loadError ? (
          <>
            <Callout tone="danger" title="Couldn't load friends">
              {loadError}
            </Callout>
            <Button label="Try again" variant="secondary" onPress={() => void loadData()} />
          </>
        ) : null}

        {loading && friends.length === 0 ? (
          <Txt variant="body" color="textMuted">
            Loading friends…
          </Txt>
        ) : null}

        {!loading && friends.length === 0 && !loadError ? (
          <Card tint>
            <Txt variant="small" color="textMuted">
              No friends yet. Search above to send friend requests.
            </Txt>
          </Card>
        ) : null}

        {friends.length > 0 ? (
          <View style={{ gap: t.spacing.sm }}>
            {friends.map((f) => (
              <View
                key={f.id}
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
                <Txt variant="body">@{f.username}</Txt>
                <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.xs }}>
                  <Chip
                    label={f.close ? "★ Close" : "☆ Close"}
                    selected={f.close}
                    onPress={() => void handleToggleClose(f)}
                  />
                  <Button
                    label="Unfriend"
                    variant="ghost"
                    onPress={() => void handleUnfriend(f.id)}
                    loading={!!busyUnfriend[f.id]}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
