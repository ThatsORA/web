// Owner: Andy — event feed; renders the event card in every state.
import { Link, router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { EmptyFeedCard, EventCard, FindingCard, useEvents } from "../../features/event-card";
import { useFindNow } from "../../lib/findNow";
import { useFeedEmptyState } from "../../lib/matcherTrigger";
import { FRIENDS_HREF, NEW_HANGOUT_HREF, SETTINGS_HREF } from "../../lib/routes";
import { Button, Callout, Screen, Txt, useTheme } from "../../ui";

/** A tapped push opens the feed with `?event=<id>` (#79): scroll to that card once it has laid out, then drop the param. */
function scrollToCard(scroll: ScrollView | null, y: number | undefined) {
  if (!scroll || y === undefined) return;
  scroll.scrollTo({ y, animated: true });
  router.setParams({ event: undefined });
}

export default function Home() {
  const t = useTheme();
  const { cards, swapped, busy, notice, loaded, error, refreshing, reload, actionsFor } = useEvents();
  const feedState = useFeedEmptyState(cards.length);
  const findNow = useFindNow(cards.map((c) => c.id));
  const finding = feedState === "finding" || findNow.state === "finding";
  const { event } = useLocalSearchParams<{ event?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const cardY = useRef<Record<string, number>>({});

  // The card may already be on screen (warm app); otherwise its onLayout below scrolls.
  useEffect(() => {
    if (event) scrollToCard(scrollRef.current, cardY.current[event]);
  }, [event]);

  return (
    <Screen
      title="Hangouts"
      scrollRef={scrollRef}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void reload()}
          tintColor={t.colors.primary}
          colors={[t.colors.primary]}
          progressBackgroundColor={t.colors.surface}
        />
      }
      headerRight={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push(SETTINGS_HREF)}
          style={({ pressed }) => ({
            opacity: pressed ? 0.6 : 1,
            padding: t.spacing.xs,
          })}
        >
          <SymbolView
            name={{ ios: "gearshape", android: "settings", web: "settings" }}
            tintColor={t.colors.textMuted}
            size={24}
          />
        </Pressable>
      }
    >
      <Button label="+ New hangout" onPress={() => router.push(NEW_HANGOUT_HREF)} />
      {/* Demo step 5 (#233): runs the scheduler now; the card arrives over the socket. */}
      <Button label="Find a hangout now" variant="outline" loading={findNow.state === "finding"} onPress={() => void findNow.find()} />
      {findNow.error ? (
        <Callout tone="danger" title="Couldn't start the search">
          {findNow.error}
        </Callout>
      ) : null}
      {findNow.state === "timedOut" ? (
        <Callout title="No new hangout yet">The scheduler didn’t find a new plan. Try again in a bit.</Callout>
      ) : null}
      {error ? (
        <>
          <Callout tone="danger" title="Couldn't load hangouts">
            {error}
          </Callout>
          <Button label="Try again" variant="secondary" onPress={() => void reload()} />
        </>
      ) : null}
      {loaded && finding ? <FindingCard /> : null}
      {loaded && !finding && feedState === "empty" ? <EmptyFeedCard onAddFriends={() => router.push(FRIENDS_HREF)} /> : null}
      {cards.map((card) => (
        <View
          key={card.id}
          onLayout={(e) => {
            cardY.current[card.id] = e.nativeEvent.layout.y;
            if (card.id === event) scrollToCard(scrollRef.current, e.nativeEvent.layout.y);
          }}
        >
          <EventCard
            card={card}
            actions={actionsFor(card)}
            swapped={swapped[card.id]}
            busy={busy[card.id]}
            notice={notice[card.id]}
          />
        </View>
      ))}
      {__DEV__ ? (
        <Link href="/(main)/card-states">
          <Txt variant="small" color="link">
            Card states (stub data)
          </Txt>
        </Link>
      ) : null}
    </Screen>
  );
}
