// Owner: Ojas — Squads tab (#76): invites to answer, my squads, and making a new one.
// Andy's (main)/squads route mounts it. Refetches whenever the tab gains focus (no socket needed).
import {
  CreateSquadRequest,
  FriendsResponse,
  InviteToSquadRequest,
  RespondToSquadRequest,
  SquadsResponse,
  routes,
} from "@web/contract";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import { api, ApiError, getToken } from "../../lib/api";
import { displayName } from "../../lib/displayName";
import { NEW_HANGOUT_HREF } from "../../lib/routes";
import { userIdFromToken } from "../../lib/session";
import { Badge, Button, Callout, Card, Chip, Screen, TextField, Txt, useTheme } from "../../ui";
import { PersonLink } from "../friends";
import { invitable, isWaiting, memberBadge, splitSquads, squadErrorMessage, type FriendT, type SquadT } from "./squads";

const NoContent = z.unknown();
const errorCode = (e: unknown) => (e instanceof ApiError ? (e.body as { error?: unknown } | null)?.error : undefined);

export function SquadsScreen() {
  const t = useTheme();
  const [squads, setSquads] = useState<SquadT[]>([]);
  const [friends, setFriends] = useState<FriendT[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<string | null>(null); // squad id being invited to, or "new"
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, f] = await Promise.all([api(routes.squads, SquadsResponse), api(routes.friends, FriendsResponse)]);
      setSquads(s.squads);
      setFriends(f.friends);
    } catch (e) {
      setError(squadErrorMessage(errorCode(e)));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function run(call: () => Promise<unknown>) {
    setError(null);
    try {
      await call();
      setPicker(null);
      setPicked([]);
      setName("");
    } catch (e) {
      setError(squadErrorMessage(errorCode(e)));
    }
    await load();
  }
  const post = (path: string, body?: unknown) => api(path, NoContent, { method: "POST", body });
  const openPicker = (id: string) => {
    setPicker(picker === id ? null : id);
    setPicked([]);
  };
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const chips = (options: FriendT[]) => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm }}>
      {options.map((f) => (
        <Chip key={f.id} label={displayName(f)} selected={picked.includes(f.id)} onPress={() => toggle(f.id)} />
      ))}
    </View>
  );

  const { invites, mine } = splitSquads(squads);
  const me = userIdFromToken(getToken());
  const now = new Date();
  const others = (s: SquadT) => s.members.filter((m) => m.status === "active").map(displayName).join(", ");

  return (
    <Screen title="Squads" subtitle="Named groups, like your roommates. Joining always needs a yes.">
      {error ? (
        <Callout tone="danger" title="Something went wrong">
          {error}
        </Callout>
      ) : null}

      {invites.map((s) => (
          <Card key={s.id} tint>
            <Txt variant="section">{s.name}</Txt>
            <Txt variant="small">With {others(s)}</Txt>
            {isWaiting(s, me) ? (
              <Txt variant="small">You're in once everyone's had 24 hours to say no.</Txt>
            ) : (
              <View style={{ flexDirection: "row", gap: t.spacing.sm }}>
                <Button label="Join" onPress={() => void run(() => post(routes.squadRespond(s.id), RespondToSquadRequest.parse({ accept: true })))} />
                <Button label="No thanks" variant="ghost" onPress={() => void run(() => post(routes.squadRespond(s.id), RespondToSquadRequest.parse({ accept: false })))} />
              </View>
            )}
          </Card>
      ))}

      {mine.map((s) => (
        <Card key={s.id}>
          <Txt variant="section">{s.name}</Txt>
          {s.members.map((m) => {
            const badge = memberBadge(m, now);
            return (
              <View key={m.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.spacing.sm }}>
                <PersonLink user={m} />
                {badge ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.sm }}>
                    <Badge label={badge} />
                    <Button label="Remove" variant="ghost" onPress={() => void run(() => api(routes.squadInvitee(s.id, m.id), NoContent, { method: "DELETE" }))} />
                  </View>
                ) : null}
              </View>
            );
          })}
          {picker === s.id ? (
            <>
              {chips(invitable(friends, s))}
              <Button
                label="Send invites"
                disabled={!picked.length}
                onPress={() => void run(() => post(routes.squadInvite(s.id), InviteToSquadRequest.parse({ invitee_ids: picked })))}
              />
            </>
          ) : null}
          <View style={{ flexDirection: "row", gap: t.spacing.sm, flexWrap: "wrap" }}>
            <Button
              label="New hangout"
              onPress={() => router.push({ pathname: NEW_HANGOUT_HREF, params: { squadId: s.id } })}
            />
            <Button label={picker === s.id ? "Cancel" : "Invite friends"} variant="outline" onPress={() => openPicker(s.id)} />
            <Button label="Leave" variant="ghost" onPress={() => void run(() => post(routes.squadLeave(s.id)))} />
          </View>
        </Card>
      ))}

      {!friends.length ? (
        <Txt variant="small">Squads are made of friends. Add some on the Friends tab first.</Txt>
      ) : picker === "new" ? (
        <Card tint>
          <Txt variant="section">New squad</Txt>
          <TextField label="Name" placeholder="Roommates" value={name} onChangeText={setName} maxLength={40} />
          <Txt variant="small">Invite friends (they'll each need to say yes)</Txt>
          {chips(invitable(friends))}
          <Button
            label="Create squad"
            disabled={!name.trim() || !picked.length}
            onPress={() => void run(() => post(routes.squads, CreateSquadRequest.parse({ name, invitee_ids: picked })))}
          />
          <Button label="Cancel" variant="ghost" onPress={() => openPicker("new")} />
        </Card>
      ) : (
        <Button label="New squad" variant="outline" onPress={() => openPicker("new")} />
      )}
    </Screen>
  );
}
