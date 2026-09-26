// Owner: Andy — event feed; renders the event card in every state.
import { Link, router } from "expo-router";
import { useState } from "react";
import { EmptyFeedCard, EventCard, FindingCard, useEvents } from "../../features/event-card";
import { useFeedEmptyState } from "../../lib/matcherTrigger";
import { FRIENDS_HREF } from "../../lib/routes";
import { session } from "../../lib/secureSession";
import { Button, Callout, Screen, Txt } from "../../ui";

export default function Home() {
  const { cards, swapped, busy, notice, loaded, error, reload, actionsFor } = useEvents();
  const feedState = useFeedEmptyState(cards.length);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);

  async function logOut() {
    setLoggingOut(true);
    setLogoutError(false);
    try {
      await session.clear();
      router.replace("/(onboarding)/signup");
    } catch {
      setLogoutError(true);
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <Screen
      title="Hangouts"
      footer={<Button label="Log out" variant="ghost" onPress={() => void logOut()} loading={loggingOut} />}
    >
      {logoutError ? (
        <Callout tone="danger" title="Couldn't log out">
          Try again.
        </Callout>
      ) : null}
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
