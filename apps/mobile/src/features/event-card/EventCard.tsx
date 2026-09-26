// Owner: Andy — the event card in every state (plan demo steps 6–9). Presentational: data in, callbacks out.
import type { EventCardPayload, EventOption } from "@web/contract";
import { ActivityIndicator, Linking, Pressable, Share, Text, View } from "react-native";
import { Button, Callout, Card, useTheme } from "../../ui";
import { canReportClosed, cardKind, freePeople, travelRows } from "./cardState";
import { mapsUrl, progressLabel, shareMessage, slotLabel, swapLabel } from "./format";

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
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.sm }}>
        <ActivityIndicator color={t.colors.primary} />
        <Text style={{ color: t.colors.text, fontSize: t.font.heading, fontWeight: "600" }}>Finding a time…</Text>
      </View>
      <Text style={{ color: t.colors.textMuted, fontSize: t.font.small }}>
        We'll show a plan here when your close friends are free together.
      </Text>
    </Card>
  );
}

export function EventCard({ card, actions, swapped, busy, notice }: Props) {
  const t = useTheme();
  const kind = cardKind(card);
  const muted = { color: t.colors.textMuted, fontSize: t.font.small };

  return (
    <Card>
      <Text accessibilityRole="header" style={{ color: t.colors.text, fontSize: t.font.heading, fontWeight: "700" }}>
        {slotLabel(card)}
      </Text>
      <Text style={muted}>{card.participants.map((p) => p.username).join(" · ")}</Text>

      {kind === "voting" || kind === "waiting" ? (
        <>
          <Text style={{ color: t.colors.text, fontSize: t.font.body, fontWeight: "600" }}>{progressLabel(card.progress)}</Text>
          {card.my_status === "ghost_passed" ? (
            <Text style={muted}>You passed quietly. Nobody else can tell.</Text>
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
        <Button label="It's closed" variant="secondary" onPress={actions.reportClosed} loading={busy} />
      ) : null}

      {kind === "chatted" ? (
        <>
          <Text style={{ color: t.colors.text, fontSize: t.font.body }}>
            Not enough votes to pick a place. Free: {freePeople(card).map((p) => p.username).join(", ")}
          </Text>
          <Button
            label="Plan it yourselves"
            onPress={() => void Share.share({ message: shareMessage(card, freePeople(card)) })}
          />
        </>
      ) : null}

      {kind === "expired" ? <Text style={muted}>Not enough people could make it this time.</Text> : null}

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
        padding: t.spacing.sm,
        gap: t.spacing.xs,
      }}
    >
      <Text style={{ color: t.colors.text, fontSize: t.font.body, fontWeight: "600" }}>{option.name}</Text>
      <Text style={{ color: t.colors.textMuted, fontSize: t.font.small }}>{option.facts_line}</Text>
      {option.ai_blurb ? <Text style={{ color: t.colors.text, fontSize: t.font.small }}>{option.ai_blurb}</Text> : null}
      <Button label={mine ? "Your vote" : "Vote"} variant={mine ? "primary" : "secondary"} onPress={onVote} disabled={disabled || mine} />
    </View>
  );
}

function Confirmed({ card, venue, swapped }: { card: EventCardPayload; venue: EventOption; swapped?: boolean }) {
  const t = useTheme();
  return (
    <>
      {swapped ? (
        <Callout tone="info">{swapLabel(venue)}</Callout>
      ) : (
        <Callout tone="success">Confirmed</Callout>
      )}
      <Text style={{ color: t.colors.text, fontSize: t.font.heading, fontWeight: "600" }}>{venue.name}</Text>
      <Text style={{ color: t.colors.textMuted, fontSize: t.font.small }}>{venue.facts_line}</Text>
      {travelRows(card).map((r) => (
        <Text key={r.id} style={{ color: t.colors.text, fontSize: t.font.small }}>
          {r.username} · {r.minutes === null ? "—" : `${Math.round(r.minutes)} min`}
        </Text>
      ))}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open ${venue.name} in Maps`}
        onPress={() => void Linking.openURL(mapsUrl(venue))}
        style={{
          backgroundColor: t.colors.infoSurface,
          borderRadius: t.radius.sm,
          padding: t.spacing.md,
          alignItems: "center",
          gap: t.spacing.xs,
        }}
      >
        <Text style={{ fontSize: 28 }}>📍</Text>
        <Text style={{ color: t.colors.info, fontSize: t.font.small, fontWeight: "600" }}>Open in Maps</Text>
      </Pressable>
    </>
  );
}
