// Owner: Ojas — Friends tab screen: search, friend requests inbox, friends list, and close-friend star toggle.
// Invariant: privacy — close-friend star status is never revealed to the other person.
import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { useFriendEvents } from "../event-card";
import { displayName } from "../../lib/displayName";
import { Button, Callout, Card, Chip, Screen, Txt, useTheme } from "../../ui";
import { FriendSearch } from "./FriendSearch";
import { PersonLink } from "./PersonLink";
import { RequestsInbox } from "./RequestsInbox";
import { UnfriendConfirmation } from "./UnfriendConfirmation";
import { unfriend, type Friend } from "./friendsApi";
import { useFriendsData } from "./useFriendsData";

export function FriendsScreen() {
  const t = useTheme();
  const {
    friends,
    setFriends,
    requests,
    loading,
    refreshing,
    loadError,
    actionError,
    setActionError,
    loadData,
    refresh,
    toggleClose,
  } = useFriendsData();
  const [busyUnfriend, setBusyUnfriend] = useState<Record<string, boolean>>({});
  const [confirmingUnfriend, setConfirmingUnfriend] = useState<Friend | null>(null);
  const removingUserId = useRef<string | null>(null);

  // Live friend:request / friend:accepted on the session socket; also refreshes the inbox.
  useFriendEvents(() => void loadData());

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
    <Screen title="Friends">
      {/* Requests Inbox */}
      <RequestsInbox requests={requests} onRefresh={() => void refresh()} />

      {/* Search & Add Section */}
      <View style={{ gap: t.spacing.sm, marginTop: t.spacing.xs }}>
        <Txt variant="section">Add new friends</Txt>
        <FriendSearch friends={friends} requests={requests} onRefresh={() => void refresh()} />
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
            onPress={() => void refresh()}
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
                    onPress={() => void toggleClose(f)}
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
