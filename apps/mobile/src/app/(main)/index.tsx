// Owner: Andy — event feed; renders the event card in every state.
import { Link, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import {
  CancelledHangoutCard,
  EmptyFeedCard,
  EventCard,
  FindingCard,
  HangoutSubTabs,
  filterHangoutsByTab,
  getPendingInviteIds,
  getRecentlyCancelledCards,
  hasPendingNotification,
  loadDismissedHangouts,
  saveDismissedHangouts,
  useEvents,
  type HangoutTab,
} from "../../features/event-card";
import { useFindNow } from "../../lib/findNow";
import { useFeedEmptyState } from "../../lib/matcherTrigger";
import { FRIENDS_HREF, NEW_HANGOUT_HREF } from "../../lib/routes";
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
  const [activeTab, setActiveTab] = useState<HangoutTab>("pending");
  const [dismissedCancelledIds, setDismissedCancelledIds] = useState<string[]>([]);
  const [seenPendingIds, setSeenPendingIds] = useState<string[]>([]);
  const feedState = useFeedEmptyState(cards.length);
  const findNow = useFindNow(cards.map((c) => c.id));
  const finding = feedState === "finding" || findNow.state === "finding";
  const { event } = useLocalSearchParams<{ event?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const cardY = useRef<Record<string, number>>({});

  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const markPendingSeen = useCallback(() => {
    const currentPendingIds = getPendingInviteIds(cardsRef.current);
    if (currentPendingIds.length > 0) {
      setSeenPendingIds((prev) => Array.from(new Set([...prev, ...currentPendingIds])));
    }
  }, []);

  const handleSelectTab = (tab: HangoutTab) => {
    if (activeTab === "pending" && tab !== "pending") {
      markPendingSeen();
    }
    setActiveTab(tab);
  };

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (activeTabRef.current === "pending") {
          markPendingSeen();
        }
      };
    }, [markPendingSeen]),
  );

  useEffect(() => {
    void loadDismissedHangouts().then((ids) => {
      if (ids.length > 0) {
        setDismissedCancelledIds((prev) => Array.from(new Set([...prev, ...ids])));
      }
    });
  }, []);

  const handleDismissCancelled = useCallback((cardId: string) => {
    setDismissedCancelledIds((prev) => {
      const updated = Array.from(new Set([...prev, cardId]));
      void saveDismissedHangouts(updated);
      return updated;
    });
  }, []);

  const hasNotification = hasPendingNotification(cards, seenPendingIds);
  const filteredCards = filterHangoutsByTab(cards, activeTab, dismissedCancelledIds);
  const recentlyCancelledCards = getRecentlyCancelledCards(cards, dismissedCancelledIds);

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
    >

      <Button label="+ New hangout" onPress={() => router.push(NEW_HANGOUT_HREF)} />
      {/* Demo step 5 (#233): runs the scheduler now; the card arrives over the socket. */}
      <Button label="Find a hangout now" variant="outline" loading={findNow.state === "finding"} onPress={() => void findNow.find()} />

      <HangoutSubTabs
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        hasNotification={hasNotification}
      />

      {activeTab === "pending"
        ? recentlyCancelledCards.map((card) => (
            <CancelledHangoutCard
              key={`cancelled-${card.id}`}
              card={card}
              onDismiss={() => handleDismissCancelled(card.id)}
            />
          ))
        : null}

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
      {loaded && !finding && feedState !== "empty" && filteredCards.length === 0 ? (
        <View style={{ padding: t.spacing.md, alignItems: "center" }}>
          <Txt variant="body" color="textMuted">
            {activeTab === "pending"
              ? "No pending hangouts requiring response."
              : activeTab === "confirmed"
              ? "No confirmed upcoming hangouts."
              : "No past hangouts."}
          </Txt>
        </View>
      ) : null}
      {filteredCards.map((card) => (
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
