// Owner: Ojas — reusable close-friend search component.
// Used by FriendsStep (onboarding) and FriendsScreen (main tab).
// Invariant: privacy — friend endpoints never reveal whether someone added you.
// Button state only ever shows "Added".
import type { UserSearchResult } from "@web/contract";
import { useRef, useState } from "react";
import { View } from "react-native";
import { Badge, Button, Callout, TextField, Txt, useTheme } from "../../ui";
import { addCloseFriend, searchUsers } from "./friendsApi";

export type FriendSearchProps = {
  /** IDs already added (e.g. from existing close friends or prior additions in session). */
  addedIds?: string[];
  /** Callback invoked when a user is successfully added. */
  onAdded?: (user: UserSearchResult) => void;
};

export function FriendSearch({ addedIds = [], onAdded }: FriendSearchProps) {
  const t = useTheme();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [localAdded, setLocalAdded] = useState<string[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
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

  async function handleAdd(user: UserSearchResult) {
    setError(null);
    setAddingId(user.id);
    try {
      await addCloseFriend(user.username);
      setLocalAdded((prev) => (prev.includes(user.id) ? prev : [...prev, user.id]));
      onAdded?.(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddingId(null);
    }
  }

  const isUserAdded = (id: string) => addedIds.includes(id) || localAdded.includes(id);

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
            const added = isUserAdded(u.id);
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
                {added ? (
                  <Badge tone="success" label="Added" />
                ) : (
                  <Button
                    label="Add"
                    variant="outline"
                    onPress={() => void handleAdd(u)}
                    loading={addingId === u.id}
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
