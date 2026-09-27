// Owner: Andy — "+ New hangout" (#70, #208, #363): search friends to pick who's coming, an optional vibe and week,
// then POST /events. The Squads screen's shortcut (`?squadId=`) pre-fills that squad and sends it as `squad_ids`. The new card reaches the feed over the socket (`event:created`).
// Invariant: privacy — the picker lists only people I added, never whether they added me back.
import { EventCardPayload, Friend, FriendsResponse, Squad, SquadsResponse, routes, VibeTag } from "@web/contract";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import type { z } from "zod";
import { FindingCard } from "../../features/event-card";
import { inviteSearch } from "../../features/event-card/cardState";
import { vibeLabel } from "../../features/event-card/format";
import { api, getToken } from "../../lib/api";
import { displayName } from "../../lib/displayName";
import {
  buildCreateEventRequest,
  getDeduplicatedInvitees,
  getSelectedSquadMembers,
  noMatchReason,
  otherWeek,
  type Week,
} from "../../lib/newHangout";
import { FRIENDS_HREF } from "../../lib/routes";
import { userIdFromToken } from "../../lib/session";
import { Button, Callout, Card, Chip, Screen, TextField, Txt, useTheme } from "../../ui";

type SquadT = z.infer<typeof Squad>;
type FriendT = z.infer<typeof Friend>;

const WEEKS: { week: Week; label: string }[] = [
  { week: "this", label: "This week" },
  { week: "next", label: "Next week" },
];

type Phase = "form" | "finding" | "no_common_time" | "no_venues";

export default function NewHangout() {
  const t = useTheme();
  const params = useLocalSearchParams<{ squadId?: string }>();
  const [squads, setSquads] = useState<SquadT[] | null>(null);
  const [friends, setFriends] = useState<FriendT[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSquadIds, setSelectedSquadIds] = useState<string[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);

  useEffect(() => {
    if (params.squadId && !selectedSquadIds.includes(params.squadId)) {
      setSelectedSquadIds((prev) => [...prev, params.squadId!]);
    }
  }, [params.squadId]);
  const [query, setQuery] = useState("");
  const [vibe, setVibe] = useState<VibeTag | null>(null);
  const [week, setWeek] = useState<Week | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reload on every visit: squads and friends added elsewhere should show up here.
  const loadData = useCallback(() => {
    setLoadError(null);
    Promise.all([
      api(routes.squads, SquadsResponse).catch(() => ({ squads: [] })),
      api(routes.friends, FriendsResponse).catch(() => ({ friends: [] })),
    ])
      .then(([sqRes, frRes]) => {
        setSquads(sqRes.squads.filter((s) => s.my_status === "active"));
        setFriends(frRes.friends);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);
  useFocusEffect(loadData);

  const currentUserId = userIdFromToken(getToken());
  const activeSquads = squads ?? [];
  const eligibleFriends = friends ?? [];

  const { inviteeIds, squadMemberIds, canSubmit } = getDeduplicatedInvitees(
    selectedSquadIds,
    selectedFriendIds,
    activeSquads,
    currentUserId,
  );
  // Who's coming: the shortcut squad's members first, then friends picked from search.
  const squadMembers = getSelectedSquadMembers(selectedSquadIds, activeSquads, currentUserId)
    .flatMap((d) => d.activeMembers)
    .filter((m, i, all) => all.findIndex((x) => x.id === m.id) === i);
  const pickedFriends = eligibleFriends.filter((f) => selectedFriendIds.includes(f.id) && !squadMemberIds.includes(f.id));
  const results = inviteSearch(eligibleFriends, [], query)
    .map(({ friend }) => friend)
    .filter((f) => !inviteeIds.includes(f.id));

  function addFriend(id: string) {
    setSelectedFriendIds((s) => [...s, id]);
    setQuery("");
  }

  // The server invites a whole squad from `squad_ids`, so removing one member drops the squad and keeps the
  // rest as direct picks. Direct invites must be friends, so squadmates I haven't added drop out too.
  function removeSquadMember(id: string) {
    const keep = squadMemberIds.filter((x) => x !== id && eligibleFriends.some((f) => f.id === x));
    setSelectedFriendIds((s) => Array.from(new Set([...s.filter((x) => x !== id), ...keep])));
    setSelectedSquadIds([]);
  }

  async function submit(forWeek: Week | null) {
    if (!canSubmit) return;
    const body = buildCreateEventRequest({ inviteeIds, squadIds: selectedSquadIds, vibe, week: forWeek }, new Date());
    setSubmitError(null);
    setPhase("finding");
    try {
      await api(routes.events, EventCardPayload, { method: "POST", body });
      setSelectedSquadIds([]);
      setSelectedFriendIds([]);
      setQuery("");
      setVibe(null);
      setWeek(null);
      setPhase("form");
      router.back();
    } catch (e) {
      const reason = noMatchReason(e);
      if (reason) return setPhase(reason);
      setPhase("form");
      setSubmitError("Couldn't start the hangout. Try again.");
    }
  }

  function tryDifferentWeek() {
    const next = otherWeek(week);
    setWeek(next);
    void submit(next);
  }

  if (phase === "finding") {
    return (
      <Screen title="New hangout">
        <FindingCard />
      </Screen>
    );
  }

  if (phase === "no_venues") {
    return (
      <Screen title="New hangout">
        <Card tint>
          <Txt variant="headline">Couldn’t find places nearby</Txt>
          <Txt variant="small">Make sure everyone has a home location set, then try again.</Txt>
          <Button label="Try again" onPress={() => void submit(week)} />
          <Button label="Change who’s coming" variant="ghost" onPress={() => setPhase("form")} />
        </Card>
      </Screen>
    );
  }

  if (phase === "no_common_time") {
    return (
      <Screen title="New hangout">
        <Card tint>
          <Txt variant="headline">No time works yet</Txt>
          <Txt variant="small">
            {week === "this" ? "This week" : week === "next" ? "Next week" : "Over the next few days"}, you’re never all
            free at once. Try a different week or fewer friends.
          </Txt>
          <Button label="Try a different week" onPress={tryDifferentWeek} />
          <Button label="Change who’s coming" variant="ghost" onPress={() => setPhase("form")} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      title="New hangout"
      footer={<Button label="Find a time" onPress={() => void submit(week)} disabled={!canSubmit} />}
    >
      {submitError ? <Callout tone="danger">{submitError}</Callout> : null}

      <Card>
        <Txt variant="section">Who’s coming</Txt>

        {loadError ? (
          <>
            <Callout tone="danger" title="Couldn't load squads and friends">
              {loadError}
            </Callout>
            <Button label="Try again" variant="secondary" onPress={loadData} />
          </>
        ) : null}

        {friends && eligibleFriends.length === 0 && squadMembers.length === 0 ? (
          <View style={{ gap: t.spacing.xs }}>
            <Txt variant="small">Add friends first, then invite them here.</Txt>
            <Button label="Add friends" variant="outline" onPress={() => router.push(FRIENDS_HREF)} />
          </View>
        ) : (
          <>
            <TextField
              placeholder="Search friends"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              returnKeyType="search"
            />
            {query.trim() && results.length === 0 ? <Txt variant="small">No friends match that search.</Txt> : null}
            {results.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm }}>
                {results.map((f) => (
                  <Chip key={f.id} label={displayName(f)} onPress={() => addFriend(f.id)} />
                ))}
              </View>
            ) : null}
            {inviteeIds.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm }}>
                {squadMembers.map((m) => (
                  <Chip
                    key={m.id}
                    label={displayName({ username: m.username ?? "member", display_name: m.display_name })}
                    selected
                    onPress={() => removeSquadMember(m.id)}
                  />
                ))}
                {pickedFriends.map((f) => (
                  <Chip
                    key={f.id}
                    label={displayName(f)}
                    selected
                    onPress={() => setSelectedFriendIds((s) => s.filter((x) => x !== f.id))}
                  />
                ))}
              </View>
            ) : null}
          </>
        )}
      </Card>

      <Card>
        <Txt variant="section">Vibe</Txt>
        <Txt variant="small">Optional. Leave it and Web picks one that fits the time.</Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm }}>
          {VibeTag.options.map((v) => (
            <Chip key={v} label={vibeLabel(v)} selected={vibe === v} onPress={() => setVibe(vibe === v ? null : v)} />
          ))}
        </View>
      </Card>

      <Card>
        <Txt variant="section">When</Txt>
        <Txt variant="small">Optional. Leave it for the next few days.</Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm }}>
          {WEEKS.map((w) => (
            <Chip
              key={w.week}
              label={w.label}
              selected={week === w.week}
              onPress={() => setWeek(week === w.week ? null : w.week)}
            />
          ))}
        </View>
      </Card>
    </Screen>
  );
}
