// Owner: Andy — the event card in every state (plan demo steps 6–9). Presentational: data in, callbacks out.
// Styled per wiki/design.md "The event card": Primer components + tokens only.
import type { EventCardPayload, EventOption } from "@web/contract";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ActionSheetIOS, ActivityIndicator, Linking, Platform, View } from "react-native";
import { getToken } from "../../lib/api";
import { CHAT_PATHNAME } from "../../lib/routes";
import { userIdFromToken } from "../../lib/session";
import { Badge, Button, Callout, Card, Chip, Txt, useTheme } from "../../ui";
import { ExpenseForm, ExpenseLedger } from "../expenses";
import { addConfirmedEventToCalendar, syncSwappedEventToCalendar } from "./calendarSync";
import { canChangeSpot, canOpenChat, cardKind, freePeople, hasEnded, isSquadHangout, passButtonLabel, passedNotice, participantBreakdown, travelRows, votingTimeRemaining } from "./cardState";
import { changeSpotPrompt } from "./changeSpot";
import { directionsUrl, googleDirectionsUrl } from "./directions";
import { progressLabel, swapLabel, timeLabel, vibeLabel } from "./format";

export type CardActions = {
  vote: (optionId: string) => void;
  ghostPass: () => void;
  changeSpot: () => void;
};

type Props = {
  card: EventCardPayload;
  actions: CardActions;
  /** The venue changed since we first saw it confirmed (someone tapped "Change spot"). */
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
  const isSquad = isSquadHangout(card);

  return (
    <View style={{ gap: t.spacing.xs }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: t.spacing.sm }}>
        <Txt variant="eyebrow" color={color}>
          {eyebrow}
        </Txt>
        <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.xs }}>
          {isSquad ? <Badge tone="info" label="Squad Hangout" /> : null}
          {badge}
        </View>
      </View>
      {onBrand ? null : (
        <>
          <Txt variant="headline" accessibilityRole="header">
            {timeLabel(card)}
          </Txt>
          <Txt variant="small">{card.participants.map((p) => p.display_name ?? p.username).join(" · ")}</Txt>
          {card.match_reason ? <Txt variant="small">{card.match_reason}</Txt> : null}
        </>
      )}
    </View>
  );
}

function OpenCard({ card, actions, busy, notice }: Props) {
  const t = useTheme();
  const kind = cardKind(card);
  const isSquad = isSquadHangout(card);
  const handleOpenChat = () => {
    router.push({
      pathname: CHAT_PATHNAME,
      params: { eventId: card.id, ended: card.viewer?.chat === "read_only" || hasEnded(card) ? "1" : "0" },
    });
  };

  const eyebrow = isSquad ? `Squad · ${vibeLabel(card.vibe_tag)}` : vibeLabel(card.vibe_tag);
  const breakdown = participantBreakdown(card);

  return (
    <Card tint={isSquad}>
      <Header card={card} eyebrow={eyebrow} badge={kind === "voting" ? <Badge tone="new" label="New" /> : null} />

      {kind === "voting" || kind === "waiting" ? (
        <>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Badge label={progressLabel(card.progress)} />
            <Txt variant="small" numeric>{votingTimeRemaining(card.vote_closes_at)}</Txt>
          </View>
          {card.my_status === "ghost_passed" ? (
            <Txt variant="small">{passedNotice(card.viewer)}</Txt>
          ) : null}
          {card.options.map((o) => (
            <OptionRow
              key={o.id ?? o.place_id}
              option={o}
              mine={!!o.id && o.id === card.my_option_id}
              disabled={busy}
              onVote={() => o.id && actions.vote(o.id)}
            />
          ))}
          {kind === "voting" ? (
            <Button label={passButtonLabel(card.viewer)} variant="ghost" onPress={actions.ghostPass} disabled={busy} />
          ) : null}
        </>
      ) : null}

      {kind === "chatted" ? (
        <>
          <Badge tone="warning" label="Not enough votes" />
          <Txt variant="small">
            {card.progress.responded === 1
              ? "1 person voted before time ran out. Discuss options or nominate a spot in chat."
              : `${card.progress.responded} of ${card.progress.total} people responded before voting closed.`}
          </Txt>

          <View style={{ gap: t.spacing.xs, marginVertical: t.spacing.xs }}>
            {breakdown.responded.length > 0 ? (
              <View style={{ gap: t.spacing.xs }}>
                <Txt variant="small">Responded:</Txt>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.xs }}>
                  {breakdown.responded.map((p) => (
                    <Chip key={p.id} label={p.display_name ?? p.username} selected />
                  ))}
                </View>
              </View>
            ) : null}
            {breakdown.pending.length > 0 ? (
              <View style={{ gap: t.spacing.xs }}>
                <Txt variant="small">Didn’t vote:</Txt>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.xs }}>
                  {breakdown.pending.map((p) => (
                    <Chip key={p.id} label={p.display_name ?? p.username} />
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          {card.options.map((o) => (
            <OptionRow
              key={o.id ?? o.place_id}
              option={o}
              mine={!!o.id && o.id === card.my_option_id}
              tally={o.id && card.outcome?.tallies ? card.outcome.tallies[o.id] : undefined}
            />
          ))}
        </>
      ) : null}

      {kind === "expired" ? (
        <>
          <Badge label="Expired" />
          <Txt variant="small">Not enough people could make it this time.</Txt>
        </>
      ) : null}

      {canOpenChat(card) ? (
        <Button
          label="Open chat"
          variant={kind === "chatted" ? "primary" : "outline"}
          onPress={handleOpenChat}
        />
      ) : null}

      {notice ? <Callout tone="danger">{notice}</Callout> : null}
    </Card>
  );
}

function OptionRow({
  option,
  mine,
  tally,
  disabled,
  onVote,
}: {
  option: EventOption;
  mine: boolean;
  tally?: number;
  disabled?: boolean;
  onVote?: () => void;
}) {
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
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Txt variant="label" color="heading">
          {option.name}
        </Txt>
        {tally !== undefined ? (
          <Badge tone={tally > 0 ? "info" : undefined} label={`${tally} ${tally === 1 ? "vote" : "votes"}`} />
        ) : null}
      </View>
      <Txt variant="small" numeric>
        {option.facts_line}
      </Txt>
      {option.ai_blurb ? <Txt>{option.ai_blurb}</Txt> : null}
      {mine ? (
        <Badge tone="info" label="Your vote" />
      ) : onVote ? (
        <Button label="Vote" onPress={onVote} disabled={disabled} />
      ) : null}
    </View>
  );
}

/** Violet `Card brand` header with the venue, then travel times and the venue actions (directions, "Change spot"). */
function ConfirmedCard({ card, venue, actions, swapped, busy, notice }: Props & { venue: EventOption }) {
  const t = useTheme();
  const [showExpense, setShowExpense] = useState(false);
  const [expenseRefresh, setExpenseRefresh] = useState(0);
  const [calendarMessage, setCalendarMessage] = useState<string | null>(null);
  const [calendarNotice, setCalendarNotice] = useState<string | null>(null);
  const [addingCalendar, setAddingCalendar] = useState(false);
  const [confirmingChange, setConfirmingChange] = useState(false);
  const status = card.status === "completed" ? "Done" : "Confirmed";
  const attendees = card.outcome?.attendees ?? [];
  const currentUserId = userIdFromToken(getToken());

  useEffect(() => {
    if (swapped) {
      void syncSwappedEventToCalendar(card).then((res) => {
        if (res?.success) {
          setCalendarMessage(res.message);
        }
      });
    }
  }, [swapped, card]);

  const handleGetDirections = () => {
    const venueLoc = {
      lat: venue.lat,
      lng: venue.lng,
      placeId: venue.place_id,
      name: venue.name,
    };
    if (Platform.OS === "ios" && ActionSheetIOS?.showActionSheetWithOptions) {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Apple Maps", "Google Maps", "Cancel"],
          cancelButtonIndex: 2,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            void Linking.openURL(directionsUrl(venueLoc, "ios"));
          } else if (buttonIndex === 1) {
            void Linking.openURL(googleDirectionsUrl(venueLoc));
          }
        }
      );
    } else {
      const url = directionsUrl(venueLoc, Platform.OS);
      void Linking.openURL(url);
    }
  };

  const handleAddToCalendar = async () => {
    setAddingCalendar(true);
    setCalendarNotice(null);
    try {
      const res = await addConfirmedEventToCalendar(card);
      if (res.success) {
        setCalendarMessage(res.message);
      } else {
        setCalendarNotice(res.message);
      }
    } catch (err: any) {
      setCalendarNotice(err?.message || "Failed to add to calendar");
    } finally {
      setAddingCalendar(false);
    }
  };

  const handleOpenChat = () => {
    router.push({
      pathname: CHAT_PATHNAME,
      params: { eventId: card.id, ended: card.viewer?.chat === "read_only" || hasEnded(card) ? "1" : "0" },
    });
  };

  const isSquad = isSquadHangout(card);
  const squadPrefix = isSquad ? "Squad · " : "";

  return (
    <View>
      <Card brand>
        <Header
          card={card}
          onBrand
          eyebrow={`${status} · ${squadPrefix}${vibeLabel(card.vibe_tag)}`}
          badge={swapped ? <Badge tone="new" label="Swapped" /> : null}
        />
        <Txt variant="headline" color="onPrimary" accessibilityRole="header">
          {venue.name}
        </Txt>
        <Txt variant="small" color="onPrimary" numeric>
          {timeLabel(card)}
        </Txt>
        {card.match_reason ? (
          <Txt variant="small" color="onPrimary">
            {card.match_reason}
          </Txt>
        ) : null}
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
            <Txt>{r.display_name ?? r.username}</Txt>
            <Txt numeric color="heading">
              {r.minutes === null ? "—" : `${Math.round(r.minutes)} min`}
            </Txt>
          </View>
        ))}
        <Button label="Get directions" variant="outline" onPress={handleGetDirections} />
        {canChangeSpot(card) ? (
          confirmingChange ? (
            <ChangeSpotConfirm
              card={card}
              onConfirm={() => {
                setConfirmingChange(false);
                actions.changeSpot();
              }}
              onCancel={() => setConfirmingChange(false)}
            />
          ) : (
            <Button label="Change spot" variant="outline" onPress={() => setConfirmingChange(true)} loading={busy} />
          )
        ) : null}
        <Button
          label={calendarMessage || "Add to calendar"}
          variant="outline"
          onPress={handleAddToCalendar}
          loading={addingCalendar}
          disabled={busy}
        />
        {calendarNotice ? <Callout tone="warning">{calendarNotice}</Callout> : null}
        {canOpenChat(card) ? <Button label="Open chat" variant="outline" onPress={handleOpenChat} /> : null}
        {attendees.length > 0 ? (
          <ExpenseLedger
            eventId={card.id}
            attendees={attendees}
            currentUserId={currentUserId}
            refreshTrigger={expenseRefresh}
            onAddExpense={() => setShowExpense(true)}
            hideAddButton={showExpense}
          />
        ) : null}
        {attendees.length > 0 && showExpense ? (
          <View style={{ gap: t.spacing.sm }}>
            <ExpenseForm
              eventId={card.id}
              attendees={attendees}
              onSaved={() => {
                setShowExpense(false);
                setExpenseRefresh((c) => c + 1);
              }}
            />
            <Button label="Cancel" variant="ghost" onPress={() => setShowExpense(false)} />
          </View>
        ) : null}
        {notice ? <Callout tone="danger">{notice}</Callout> : null}
      </Card>
    </View>
  );
}

/** Names the next backup and asks before moving everyone there (#219). */
function ChangeSpotConfirm({ card, onConfirm, onCancel }: { card: EventCardPayload; onConfirm: () => void; onCancel: () => void }) {
  const t = useTheme();
  const { title, body } = changeSpotPrompt(card);
  return (
    <View style={{ gap: t.spacing.sm }}>
      <Callout tone="info" title={title}>
        {body}
      </Callout>
      <Button label="Change for everyone" variant="outline" onPress={onConfirm} />
      <Button label="Keep this spot" variant="ghost" onPress={onCancel} />
    </View>
  );
}
