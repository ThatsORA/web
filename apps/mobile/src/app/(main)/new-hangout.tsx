// Owner: Andy — "+ New hangout" (#70, #208): pick squads and individual friends, an optional vibe and week, then
// POST /events. The new card reaches the feed over the socket (`event:created`).
// Invariant: privacy — the picker lists only people I added, never whether they added me back.
import { EventCardPayload, Friend, FriendsResponse, Squad, SquadsResponse, routes, VibeTag } from "@web/contract";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import type { z } from "zod";
import { FindingCard } from "../../features/event-card";
import { vibeLabel } from "../../features/event-card/format";
import { api, getToken } from "../../lib/api";
import { displayName } from "../../lib/displayName";
import {
  MAX_INVITEES,
  buildCreateEventRequest,
  getDeduplicatedInvitees,
  noMatchReason,
  otherWeek,
  type Week,
} from "../../lib/newHangout";
import { FRIENDS_HREF } from "../../lib/routes";
import { userIdFromToken } from "../../lib/session";
import { Button, Callout, Card, Chip, Screen, Txt, useTheme } from "../../ui";

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
  const [squadsOpen, setSquadsOpen] = useState(true);
  const [peopleOpen, setPeopleOpen] = useState(true);
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

  const { inviteeIds, squadMemberIds, totalCount, isValidCount } = getDeduplicatedInvitees(
    selectedSquadIds,
    selectedFriendIds,
    activeSquads,
    currentUserId,
  );

  async function submit(forWeek: Week | null) {
    if (!isValidCount) return;
    const body = buildCreateEventRequest({ inviteeIds, squadIds: selectedSquadIds, vibe, week: forWeek }, new Date());
    setSubmitError(null);
    setPhase("finding");
    try {
      await api(routes.events, EventCardPayload, { method: "POST", body });
      setSelectedSquadIds([]);
      setSelectedFriendIds([]);
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
      subtitle="Pick who’s coming. Web finds a time you’re all free and three places to vote on."
      footer={
        <Button
          label="Find a time"
          onPress={() => void submit(week)}
          disabled={!isValidCount}
        />
      }
    >
      {submitError ? <Callout tone="danger">{submitError}</Callout> : null}

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Txt variant="section">Who’s coming</Txt>
          <Txt variant="small" numeric>
            {totalCount} of 6 people total ({inviteeIds.length} of {MAX_INVITEES} picked)
          </Txt>
        </View>

        <Txt variant="small">
          Squad invitees use visible Pass and directly invited people use Ghost Pass; overlap uses squad rules.
        </Txt>

        {loadError ? (
          <>
            <Callout tone="danger" title="Couldn't load squads and friends">
              {loadError}
            </Callout>
            <Button label="Try again" variant="secondary" onPress={loadData} />
          </>
        ) : null}

        {/* Section 1: Squads */}
        <View style={{ gap: t.spacing.xs, marginTop: t.spacing.xs }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Toggle Squads Section"
            onPress={() => setSquadsOpen((o) => !o)}
            style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: t.spacing.xs }}
          >
            <Txt variant="title">Squads ({activeSquads.length})</Txt>
            <Txt variant="small">{squadsOpen ? "Collapse" : "Expand"}</Txt>
          </Pressable>

          {squadsOpen ? (
            activeSquads.length === 0 ? (
              <Txt variant="small">No active squads yet.</Txt>
            ) : (
              <View style={{ gap: t.spacing.xs }}>
                {activeSquads.map((sq) => {
                  const selected = selectedSquadIds.includes(sq.id);
                  const activeMembers = sq.members.filter((m) => m.status === "active" && m.id !== currentUserId);
                  const memberNames = activeMembers.map(displayName).join(", ");
                  return (
                    <View key={sq.id} style={{ gap: t.spacing.xs }}>
                      <Chip
                        label={sq.name}
                        selected={selected}
                        onPress={() =>
                          setSelectedSquadIds((s) =>
                            s.includes(sq.id) ? s.filter((x) => x !== sq.id) : [...s, sq.id],
                          )
                        }
                      />
                      {selected ? (
                        <Txt variant="small" style={{ paddingLeft: t.spacing.xs }}>
                          Active members: {memberNames || "Only you"}
                        </Txt>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )
          ) : null}
        </View>

        {/* Section 2: People */}
        <View style={{ gap: t.spacing.xs, marginTop: t.spacing.xs }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Toggle People Section"
            onPress={() => setPeopleOpen((o) => !o)}
            style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: t.spacing.xs }}
          >
            <Txt variant="title">People ({eligibleFriends.length})</Txt>
            <Txt variant="small">{peopleOpen ? "Collapse" : "Expand"}</Txt>
          </Pressable>

          {peopleOpen ? (
            eligibleFriends.length === 0 ? (
              <View style={{ gap: t.spacing.xs }}>
                <Txt variant="small">Add friends first, then invite them here.</Txt>
                <Button label="Add friends" variant="outline" onPress={() => router.push(FRIENDS_HREF)} />
              </View>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm }}>
                {eligibleFriends.map((f) => {
                  const selected = selectedFriendIds.includes(f.id);
                  const inSelectedSquad = squadMemberIds.includes(f.id);
                  return (
                    <Chip
                      key={f.id}
                      label={displayName(f)}
                      selected={selected || inSelectedSquad}
                      onPress={() =>
                        setSelectedFriendIds((s) =>
                          s.includes(f.id) ? s.filter((x) => x !== f.id) : [...s, f.id],
                        )
                      }
                    />
                  );
                })}
              </View>
            )
          ) : null}
        </View>

        {!isValidCount && inviteeIds.length > MAX_INVITEES ? (
          <Callout tone="danger">
            Hangouts are limited to 6 people max (including you). Pick fewer squads or people.
          </Callout>
        ) : null}
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
