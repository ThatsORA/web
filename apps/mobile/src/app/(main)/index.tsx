// Owner: Andy — event feed; renders the event card in every state.
import { Link, router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Pressable, RefreshControl } from "react-native";
import { EmptyFeedCard, EventCard, FindingCard, useEvents } from "../../features/event-card";
import { useFeedEmptyState } from "../../lib/matcherTrigger";
import { FRIENDS_HREF, SETTINGS_HREF } from "../../lib/routes";
import { Button, Callout, Screen, Txt, useTheme } from "../../ui";

export default function Home() {
  const t = useTheme();
  const { cards, swapped, busy, notice, loaded, error, refreshing, reload, actionsFor } = useEvents();
  const feedState = useFeedEmptyState(cards.length);

  return (
    <Screen
      title="Hangouts"
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
      {error ? (
        <>
          <Callout tone="danger" title="Couldn't load hangouts">
            {error}
          </Callout>
          <Button label="Try again" variant="secondary" onPress={() => void reload()} />
        </>
      ) : null}
      {loaded && feedState === "finding" ? <FindingCard /> : null}
      {loaded && feedState === "empty" ? <EmptyFeedCard onAddFriends={() => router.push(FRIENDS_HREF)} /> : null}
      {cards.map((card) => (
        <EventCard
          key={card.id}
          card={card}
          actions={actionsFor(card)}
          swapped={swapped[card.id]}
          busy={busy[card.id]}
          notice={notice[card.id]}
        />
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
