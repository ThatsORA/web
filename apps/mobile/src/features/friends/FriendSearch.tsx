// Owner: Ojas — search users by username and display action buttons:
// Add friend → Requested (tap to cancel) → Friends; Accept when they requested you first.
import { useRef, useState } from "react";
import { View } from "react-native";
import { Badge, Button, Callout, TextField, Txt, useTheme } from "../../ui";
import {
  acceptFriendRequest,
  deleteFriendRequest,
  searchUsers,
  sendFriendRequest,
  type Friend,
  type FriendRequestsResponse,
  type UserSearchResult,
} from "./friendsApi";

export type FriendSearchProps = {
  friends?: Friend[];
  requests?: FriendRequestsResponse;
  onRefresh?: () => void;
};

export function FriendSearch({ friends = [], requests = { incoming: [], outgoing: [] }, onRefresh }: FriendSearchProps) {
  const t = useTheme();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  async function handleSearch(text: string) {
    setQ(text);
    const n = ++latest.current;
    const query = text.trim();
    if (!query) {
      setResults([]);
      return;
    }
    try {
      const users = await searchUsers(query);
      if (n === latest.current) {
        setResults(users);
      }
    } catch (e) {
      if (n === latest.current) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }

  async function handleAdd(username: string, userId: string) {
    setError(null);
    setActionBusy((prev) => ({ ...prev, [userId]: true }));
    try {
      await sendFriendRequest(username);
      onRefresh?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy((prev) => ({ ...prev, [userId]: false }));
    }
  }

  async function handleCancel(requestId: string, userId: string) {
    setError(null);
    setActionBusy((prev) => ({ ...prev, [userId]: true }));
    try {
      await deleteFriendRequest(requestId);
      onRefresh?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy((prev) => ({ ...prev, [userId]: false }));
    }
  }

  async function handleAccept(requestId: string, userId: string) {
    setError(null);
    setActionBusy((prev) => ({ ...prev, [userId]: true }));
    try {
      await acceptFriendRequest(requestId);
      onRefresh?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy((prev) => ({ ...prev, [userId]: false }));
    }
  }

  return (
    <View style={{ gap: t.spacing.sm }}>
      <TextField
        label="Username"
        placeholder="riley"
        value={q}
        onChangeText={(text) => void handleSearch(text)}
        autoCorrect={false}
      />
      {results.length > 0 ? (
        <View style={{ gap: t.spacing.sm }}>
          {results.map((u) => {
            const isFriend = friends.some((f) => f.id === u.id);
            const incoming = requests.incoming.find((r) => r.user.id === u.id);
            const outgoing = requests.outgoing.find((r) => r.user.id === u.id);
            const busy = !!actionBusy[u.id];

            return (
              <View
                key={u.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: t.spacing.sm,
                  paddingVertical: t.spacing.xs,
                }}
              >
                <Txt variant="body">@{u.username}</Txt>
                {isFriend ? (
                  <Badge tone="neutral" label="Friends" />
                ) : incoming ? (
                  <Button
                    label="Accept"
                    variant="primary"
                    onPress={() => void handleAccept(incoming.id, u.id)}
                    loading={busy}
                  />
                ) : outgoing ? (
                  <Button
                    label="Requested"
                    variant="outline"
                    onPress={() => void handleCancel(outgoing.id, u.id)}
                    loading={busy}
                  />
                ) : (
                  <Button
                    label="Add friend"
                    variant="outline"
                    onPress={() => void handleAdd(u.username, u.id)}
                    loading={busy}
                  />
                )}
              </View>
            );
          })}
        </View>
      ) : null}
      {error ? (
        <Callout tone="danger" title="Something went wrong">
          {error}
        </Callout>
      ) : null}
    </View>
  );
}
