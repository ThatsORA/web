// Owner: Andy — the event card in every state (plan demo steps 6–9). Presentational: data in, callbacks out.
// Styled per wiki/design.md "The event card": Primer components + tokens only.
import type { EventCardPayload, EventOption } from "@web/contract";
import type { ReactNode } from "react";
import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, Share, View } from "react-native";
import { Badge, Button, Callout, Card, Txt, useTheme } from "../../ui";
import { ExpenseForm } from "../expenses";
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
      <Txt variant="small">We’ll show a plan here when your close friends are free together.</Txt>
    </Card>
  );
}

/** The feed's default state with no events. No spinner, and never says who has or hasn't added you. */
export function EmptyFeedCard({ onAddFriends }: { onAddFriends: () => void }) {
  return (
    <Card tint>
      <Txt variant="headline">No plans yet</Txt>
      <Txt variant="small">Web suggests a hangout when your close friends are free at the same time. We check every few minutes.</Txt>
      <Button label="Add friends" variant="outline" onPress={onAddFriends} />
    </Card>
  );
}

export function EventCard(props: Props) {
  const { card } = props;
  const kind = cardKind(card);
  if ((kind === "confirmed" || kind === "completed") && card.outcome?.venue) {
    return <ConfirmedCard {...props} venue={card.outcome.venue} />;
  }
  return <OpenCard {...props} />;
}

/** Eyebrow (vibe) + Playfair time headline + who's invited, with an optional badge on the right. */
function Header({ card, eyebrow, badge, onBrand }: { card: EventCardPayload; eyebrow: string; badge?: ReactNode; onBrand?: boolean }) {
  const t = useTheme();
  const color = onBrand ? "onPrimary" : undefined;
  return (
    <View style={{ gap: t.spacing.xs }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: t.spacing.sm }}>
        <Txt variant="eyebrow" color={color}>
          {eyebrow}
        </Txt>
        {badge}
      </View>
      {onBrand ? null : (
        <>
          <Txt variant="headline" accessibilityRole="header">
            {timeLabel(card)}
          </Txt>
          <Txt variant="small">{card.participants.map((p) => p.username).join(" · ")}</Txt>
        </>
      )}
    </View>
  );
}

function OpenCard({ card, actions, busy, notice }: Props) {
  const kind = cardKind(card);
  return (
    <Card>
      <Header card={card} eyebrow={vibeLabel(card.vibe_tag)} badge={kind === "voting" ? <Badge tone="new" label="New" /> : null} />

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

      {kind === "chatted" ? (
        <>
          <Badge tone="warning" label="Not enough votes" />
          <Txt>Everyone’s free, you just need a place. Free: {freePeople(card).map((p) => p.username).join(", ")}</Txt>
          <Button
            label="Plan it yourselves"
            onPress={() => void Share.share({ message: shareMessage(card, freePeople(card)) })}
          />
        </>
      ) : null}

      {kind === "expired" ? (
        <>
          <Badge label="Expired" />
          <Txt variant="small">Not enough people could make it this time.</Txt>
        </>
      ) : null}

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
        borderRadius: t.radius.sm,
        padding: t.spacing.ms,
        gap: t.spacing.xs,
      }}
    >
      <Txt variant="label" color="heading">
        {option.name}
      </Txt>
      <Txt variant="small" numeric>
        {option.facts_line}
      </Txt>
      {option.ai_blurb ? <Txt>{option.ai_blurb}</Txt> : null}
      {mine ? <Badge tone="info" label="Your vote" /> : <Button label="Vote" onPress={onVote} disabled={disabled} />}
    </View>
  );
}

/** Violet `Card brand` header with the venue, then travel times, map pin and "It's closed". */
function ConfirmedCard({ card, venue, actions, swapped, busy, notice }: Props & { venue: EventOption }) {
  const t = useTheme();
  const [showExpense, setShowExpense] = useState(false);
  const status = card.status === "completed" ? "Done" : "Confirmed";
  const attendees = card.outcome?.attendees ?? [];
  return (
    <View>
      <Card brand>
        <Header
          card={card}
          onBrand
          eyebrow={`${status} · ${vibeLabel(card.vibe_tag)}`}
          badge={swapped ? <Badge tone="new" label="Swapped" /> : null}
        />
        <Txt variant="headline" color="onPrimary" accessibilityRole="header">
          {venue.name}
        </Txt>
        <Txt variant="small" color="onPrimary" numeric>
          {timeLabel(card)}
        </Txt>
        {swapped ? (
          <Txt variant="small" color="onPrimary" numeric>
            {swapLabel(venue)}
          </Txt>
        ) : null}
      </Card>
      <Card>
        <Txt variant="small" numeric>
          {venue.facts_line}
        </Txt>
        {travelRows(card).map((r) => (
          <View key={r.id} style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Txt>{r.username}</Txt>
            <Txt numeric color="heading">
              {r.minutes === null ? "—" : `${Math.round(r.minutes)} min`}
            </Txt>
          </View>
        ))}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Open ${venue.name} in Maps`}
          onPress={() => void Linking.openURL(mapsUrl(venue))}
          style={({ pressed }) => ({
            backgroundColor: t.colors.surfaceCard,
            opacity: pressed ? 0.8 : 1,
            borderColor: t.colors.border,
            borderWidth: 1,
            borderRadius: t.radius.sm,
            padding: t.spacing.md,
            alignItems: "center",
            gap: t.spacing.xs,
          })}
        >
          <Txt variant="headline">📍</Txt>
          <Txt variant="label">Open in Maps</Txt>
        </Pressable>
        {canReportClosed(card) ? (
          <Button label="It's closed" variant="outline" onPress={actions.reportClosed} loading={busy} />
        ) : null}
        {attendees.length > 0 ? (
          showExpense ? (
            <View style={{ gap: t.spacing.sm }}>
              <ExpenseForm eventId={card.id} attendees={attendees} onSaved={() => setShowExpense(false)} />
              <Button label="Cancel" variant="ghost" onPress={() => setShowExpense(false)} />
            </View>
          ) : (
            <Button label="Add expense" variant="outline" onPress={() => setShowExpense(true)} />
          )
        ) : null}
        {notice ? <Callout tone="danger">{notice}</Callout> : null}
      </Card>
    </View>
  );
}
