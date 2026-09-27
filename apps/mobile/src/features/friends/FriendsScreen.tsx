// Owner: Ojas — Friends tab screen: search, friend requests inbox, friends list, and close-friend star toggle.
// Invariant: privacy — close-friend star status is never revealed to the other person.
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useFriendEvents } from "../event-card";
import { displayName } from "../../lib/displayName";
import { Button, Callout, Card, Chip, Screen, Txt, useTheme } from "../../ui";
import { FriendSearch } from "./FriendSearch";
import { PersonLink } from "./PersonLink";
import { RequestsInbox } from "./RequestsInbox";
import { UnfriendConfirmation } from "./UnfriendConfirmation";
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
  const [confirmingUnfriend, setConfirmingUnfriend] = useState<Friend | null>(null);
  const removingUserId = useRef<string | null>(null);

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

  async function handleUnfriend() {
    const friend = confirmingUnfriend;
    if (!friend || removingUserId.current) return;
    removingUserId.current = friend.id;
    setActionError(null);
    setBusyUnfriend((prev) => ({ ...prev, [friend.id]: true }));
    try {
      await unfriend(friend.id);
      setFriends((prev) => prev.filter((item) => item.id !== friend.id));
      setConfirmingUnfriend(null);
      await loadData();
    } catch (e) {
      setActionError(`Couldn't unfriend ${displayName(friend)}. ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      removingUserId.current = null;
      setBusyUnfriend((prev) => ({ ...prev, [friend.id]: false }));
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

        {confirmingUnfriend ? (
          <UnfriendConfirmation
            friend={confirmingUnfriend}
            busy={!!busyUnfriend[confirmingUnfriend.id]}
            onCancel={() => { setConfirmingUnfriend(null); setActionError(null); }}
            onConfirm={() => void handleUnfriend()}
          />
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
                <PersonLink user={f} />
                <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.xs }}>
                  <Chip
                    label={f.close ? "★ Close" : "☆ Close"}
                    selected={f.close}
                    onPress={() => void handleToggleClose(f)}
                  />
                  <Button
                    label="Unfriend"
                    variant="ghost"
                    onPress={() => { setActionError(null); setConfirmingUnfriend(f); }}
                    disabled={!!confirmingUnfriend || !!removingUserId.current}
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
