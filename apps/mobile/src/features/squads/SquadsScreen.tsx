// Owner: Ojas — Squads tab (#76): making a new squad (top), invites to answer, and my squads,
// each with New hangout, invite, and a confirmed Leave. Layout by Andy (#360).
// Andy's (main)/squads route mounts it. Refetches whenever the tab gains focus (no socket needed).
import {
  CreateSquadRequest,
  FriendsResponse,
  RespondToSquadRequest,
  SquadsResponse,
  routes,
} from "@web/contract";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import { api, ApiError, getToken } from "../../lib/api";
import { displayName } from "../../lib/displayName";
import { NEW_HANGOUT_HREF } from "../../lib/routes";
import { userIdFromToken } from "../../lib/session";
import { Badge, Button, Callout, Card, Chip, Modal, Screen, TextField, Txt, useTheme } from "../../ui";
import { PersonLink } from "../friends";
import { SquadInviteButton } from "./SquadInvite";
import { invitable, isWaiting, memberBadge, splitSquads, squadErrorMessage, type FriendT, type SquadT } from "./squads";

const NoContent = z.unknown();
const errorCode = (e: unknown) => (e instanceof ApiError ? (e.body as { error?: unknown } | null)?.error : undefined);

export function SquadsScreen() {
  const t = useTheme();
  const [squads, setSquads] = useState<SquadT[]>([]);
  const [friends, setFriends] = useState<FriendT[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<"new" | null>(null); // "new" while the create form is open
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [leaving, setLeaving] = useState<SquadT | null>(null); // squad awaiting Leave confirmation

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
  const toggleNew = () => {
    setPicker(picker === "new" ? null : "new");
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
    <Screen title="Squads">
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
          <Button label="Cancel" variant="ghost" onPress={toggleNew} />
        </Card>
      ) : (
        <Button label="New squad" variant="outline" onPress={toggleNew} />
      )}

      {error ? (
        <Callout tone="danger" title="Something went wrong">
          {error}
        </Callout>
      ) : null}

      {invites.map((s) => (
        <Card key={s.id} tint>
          <Txt variant="section">{s.name}</Txt>
          <Txt variant="small">With {others(s)}</Txt>
          <View style={{ flexDirection: "row", gap: t.spacing.sm }}>
            <Button label="Join" onPress={() => void run(() => post(routes.squadRespond(s.id), RespondToSquadRequest.parse({ accept: true })))} />
            <Button label="No thanks" variant="ghost" onPress={() => void run(() => post(routes.squadRespond(s.id), RespondToSquadRequest.parse({ accept: false })))} />
          </View>
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
          <Button label="New hangout" onPress={() => router.push({ pathname: NEW_HANGOUT_HREF, params: { squadId: s.id } })} />
          <View style={{ width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <SquadInviteButton squad={s} onInvited={() => void load()} />
            <Button label="Leave" variant="ghost" onPress={() => setLeaving(s)} />
          </View>
        </Card>
      ))}

      <Modal visible={!!leaving} onClose={() => setLeaving(null)} title={leaving ? `Leave ${leaving.name}?` : undefined}>
        <Txt variant="small">You'll stop getting this squad's hangouts. Someone will have to invite you again to rejoin.</Txt>
        <Button
          label="Leave squad"
          onPress={() => {
            const s = leaving;
            setLeaving(null);
            if (s) void run(() => post(routes.squadLeave(s.id)));
          }}
        />
        <Button label="Cancel" variant="ghost" onPress={() => setLeaving(null)} />
      </Modal>
    </Screen>
  );
}
