// Owner: Ojas — onboarding step 5: search by username, tap Add. You only ever see "Added"
// (demo step 4): nothing here says whether they've added you back.
import { AddCloseFriendRequest, routes, UserSearchResponse } from "@web/contract";
import { useRef, useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import { api } from "../../lib/api";
import { stepEyebrow, type OnboardingStepProps } from "../../lib/onboarding";
import { Badge, Button, Callout, Screen, TextField, Txt, useTheme } from "../../ui";

type Found = z.infer<typeof UserSearchResponse>["users"];

export function FriendsStep({ onDone }: OnboardingStepProps) {
  const t = useTheme();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Found>([]);
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  async function search(text: string) {
    setQ(text);
    const n = ++latest.current;
    const query = text.trim();
    if (!query) return setResults([]);
    try {
      const { users } = await api(`${routes.userSearch}?q=${encodeURIComponent(query)}`, UserSearchResponse);
      if (n === latest.current) setResults(users);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function add(username: string, id: string) {
    setError(null);
    try {
      await api(routes.closeFriends, z.unknown(), { method: "POST", body: AddCloseFriendRequest.parse({ username }) });
      setAdded((a) => [...a, id]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Screen
      eyebrow={stepEyebrow("friends")}
      title="Add close friends"
      subtitle="Search by username. They won't be told, and you won't see if they add you back."
      footer={<Button label={added.length ? "Done" : "Skip for now"} variant={added.length ? "primary" : "ghost"} onPress={onDone} />}
    >
      <TextField label="Username" placeholder="riley" value={q} onChangeText={(text) => void search(text)} autoCorrect={false} />
      <View style={{ gap: t.spacing.sm }}>
        {results.map((u) => (
          <View key={u.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.spacing.sm }}>
            <Txt variant="body">@{u.username}</Txt>
            {added.includes(u.id) ? <Badge tone="success" label="Added" /> : <Button label="Add" variant="outline" onPress={() => void add(u.username, u.id)} />}
          </View>
        ))}
      </View>
      {error ? (
        <Callout tone="danger" title="Something went wrong">
          {error}
        </Callout>
      ) : null}
    </Screen>
  );
}
