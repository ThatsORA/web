// Owner: Andy — the event card in every state (plan demo steps 6–9). Presentational: data in, callbacks out.
// Look follows wiki/design.md "The event card".
import type { EventCardPayload, EventOption } from "@web/contract";
import { ActivityIndicator, Linking, Pressable, Share, View } from "react-native";
import { Badge, Button, Callout, Card, Txt, useTheme } from "../../ui";
import { canReportClosed, cardKind, freePeople, travelRows } from "./cardState";
import { mapsUrl, progressLabel, shareMessage, swapLabel, timeLabel, vibeLabel } from "./format";

export type CardActions = {
  vote: (optionId: string) => void;
  ghostPass: () => void;
  reportClosed: () => void;
};

type Props = {
  card: EventCardPayload;
  actions: CardActions;
  /** The venue changed since we first saw it confirmed ("It's closed" swap). */
  swapped?: boolean;
  busy?: boolean;
  notice?: string;
};

/** Shown while the matcher is still working and there's no event yet. */
export function FindingCard() {
  const t = useTheme();
  return (
    <Card tint>
      <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.sm }}>
        <ActivityIndicator color={t.colors.primary} />
        <Txt variant="headline">Finding a time…</Txt>
      </View>
      <Txt variant="small">We'll show a plan here when your close friends are free together.</Txt>
    </Card>
  );
}

export function EventCard({ card, actions, swapped, busy, notice }: Props) {
  const kind = cardKind(card);

  return (
    <Card>
      <Txt variant="eyebrow">{vibeLabel(card.vibe_tag)}</Txt>
      <Txt variant="headline" accessibilityRole="header">
        {timeLabel(card)}
      </Txt>
      <Txt variant="small">{card.participants.map((p) => p.username).join(" · ")}</Txt>

      {kind === "voting" || kind === "waiting" ? (
        <>
          <Badge label={progressLabel(card.progress)} />
          {card.my_status === "ghost_passed" ? (
            <Txt variant="small">You passed quietly. Nobody else can tell.</Txt>
          ) : (
            card.options.map((o) => (
              <OptionRow
                key={o.id ?? o.place_id}
                option={o}
                mine={!!o.id && o.id === card.my_option_id}
                disabled={busy}
                onVote={() => o.id && actions.vote(o.id)}
              />
            ))
          )}
          {kind === "voting" ? <Button label="Ghost Pass" variant="ghost" onPress={actions.ghostPass} disabled={busy} /> : null}
        </>
      ) : null}

      {(kind === "confirmed" || kind === "completed") && card.outcome?.venue ? (
        <Confirmed card={card} venue={card.outcome.venue} swapped={swapped} />
      ) : null}
      {kind === "confirmed" && canReportClosed(card) ? (
        <Button label="It's closed" variant="outline" onPress={actions.reportClosed} loading={busy} />
      ) : null}

      {kind === "chatted" ? (
        <>
          <Txt variant="body">
            Not enough votes to pick a place. Free: {freePeople(card).map((p) => p.username).join(", ")}
          </Txt>
          <Button
            label="Plan it yourselves"
            onPress={() => void Share.share({ message: shareMessage(card, freePeople(card)) })}
          />
        </>
      ) : null}

      {kind === "expired" ? <Txt variant="small">Not enough people could make it this time.</Txt> : null}

      {notice ? <Callout tone="danger">{notice}</Callout> : null}
    </Card>
  );
}

function OptionRow({ option, mine, disabled, onVote }: { option: EventOption; mine: boolean; disabled?: boolean; onVote: () => void }) {
  const t = useTheme();
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: mine ? t.colors.primary : t.colors.border,
        backgroundColor: mine ? t.colors.primarySofter : t.colors.surface,
        borderRadius: t.radius.sm,
        padding: t.spacing.md,
        gap: t.spacing.xs,
      }}
    >
      <Txt variant="label" color="heading">
        {option.name}
      </Txt>
      <Txt variant="small" numeric>
        {option.facts_line}
      </Txt>
      {option.ai_blurb ? <Txt variant="body">{option.ai_blurb}</Txt> : null}
      {mine ? <Badge tone="info" label="✓ Your vote" /> : <Button label="Vote" onPress={onVote} disabled={disabled} />}
    </View>
  );
}

function Confirmed({ card, venue, swapped }: { card: EventCardPayload; venue: EventOption; swapped?: boolean }) {
  const t = useTheme();
  return (
    <>
      <Card brand>
        {swapped ? <Badge tone="new" label="Swapped" /> : <Txt variant="eyebrow" color="onPrimary">Confirmed</Txt>}
        <Txt variant="headline" color="onPrimary">
          {venue.name}
        </Txt>
        <Txt variant="small" color="onPrimary" numeric>
          {swapped ? swapLabel(venue) : venue.facts_line}
        </Txt>
      </Card>
      {travelRows(card).map((r) => (
        <View key={r.id} style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Txt variant="body">{r.username}</Txt>
          <Txt variant="body" color="heading" numeric>
            {r.minutes === null ? "—" : `${Math.round(r.minutes)} min`}
          </Txt>
        </View>
      ))}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open ${venue.name} in Maps`}
        onPress={() => void Linking.openURL(mapsUrl(venue))}
        style={({ pressed }) => ({
          backgroundColor: pressed ? t.colors.primarySoft : t.colors.surfaceCard,
          borderColor: t.colors.border,
          borderWidth: 1,
          borderRadius: t.radius.sm,
          padding: t.spacing.md,
          alignItems: "center",
          gap: t.spacing.xs,
        })}
      >
        <Txt variant="stat">📍</Txt>
        <Txt variant="label" color="link">
          Open in Maps
        </Txt>
      </Pressable>
    </>
  );
}
