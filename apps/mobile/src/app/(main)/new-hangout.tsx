// Owner: Andy — "+ New hangout" (#70): pick up to 5 friends, an optional vibe and week, then
// POST /events. The new card reaches the feed over the socket (`event:created`).
// Invariant: privacy — the picker lists only people I added, never whether they added me back.
import { EventCardPayload, routes, VibeTag, type CloseFriend } from "@web/contract";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { FindingCard } from "../../features/event-card";
import { vibeLabel } from "../../features/event-card/format";
import { getCloseFriends } from "../../features/friends/friendsApi";
import { api } from "../../lib/api";
import {
  MAX_INVITEES,
  buildCreateEventRequest,
  isNoCommonTime,
  otherWeek,
  toggleInvitee,
  type Week,
} from "../../lib/newHangout";
import { FRIENDS_HREF } from "../../lib/routes";
import { Button, Callout, Card, Chip, Screen, Txt, useTheme } from "../../ui";

const WEEKS: { week: Week; label: string }[] = [
  { week: "this", label: "This week" },
  { week: "next", label: "Next week" },
];

type Phase = "form" | "finding" | "no_time";

export default function NewHangout() {
  const t = useTheme();
  const [friends, setFriends] = useState<CloseFriend[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [vibe, setVibe] = useState<VibeTag | null>(null);
  const [week, setWeek] = useState<Week | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reload on every visit: friends added on the Friends tab should show up here.
  const loadFriends = useCallback(() => {
    setLoadError(null);
    getCloseFriends()
      .then(setFriends)
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);
  useFocusEffect(loadFriends);

  async function submit(forWeek: Week | null) {
    const body = buildCreateEventRequest({ inviteeIds: selected, vibe, week: forWeek }, new Date());
    setSubmitError(null);
    setPhase("finding");
    try {
      await api(routes.events, EventCardPayload, { method: "POST", body });
      setSelected([]);
      setVibe(null);
      setWeek(null);
      setPhase("form");
      router.back();
    } catch (e) {
      if (isNoCommonTime(e)) return setPhase("no_time");
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

  if (phase === "no_time") {
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
          disabled={selected.length === 0}
        />
      }
    >
      {submitError ? <Callout tone="danger">{submitError}</Callout> : null}

      <Card>
        <Txt variant="section">Who’s coming</Txt>
        <Txt variant="small" numeric>
          {selected.length} of {MAX_INVITEES} picked
        </Txt>
        {loadError ? (
          <>
            <Callout tone="danger" title="Couldn't load friends">
              {loadError}
            </Callout>
            <Button label="Try again" variant="secondary" onPress={loadFriends} />
          </>
        ) : friends && friends.length === 0 ? (
          <>
            <Txt variant="small">Add friends first, then invite them here.</Txt>
            <Button label="Add friends" variant="outline" onPress={() => router.push(FRIENDS_HREF)} />
          </>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm }}>
            {(friends ?? []).map((f) => (
              <Chip
                key={f.id}
                label={`@${f.username}`}
                selected={selected.includes(f.id)}
                onPress={() => setSelected((s) => toggleInvitee(s, f.id))}
              />
            ))}
          </View>
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
