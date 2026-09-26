// Owner: Andy — event feed; renders the event card in every state.
import { router } from "expo-router";
import { EventCard, FindingCard, useEvents } from "../../features/event-card";
import { Button, Callout, Screen } from "../../ui";

export default function Home() {
  const { cards, swapped, busy, notice, loaded, error, reload, actionsFor } = useEvents();
  return (
    <Screen title="Hangouts">
      {error ? (
        <>
          <Callout tone="danger" title="Couldn't load hangouts">
            {error}
          </Callout>
          <Button label="Try again" variant="secondary" onPress={() => void reload()} />
        </>
      ) : null}
      {loaded && cards.length === 0 ? <FindingCard /> : null}
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
        <Button label="Card states (stub data)" variant="ghost" onPress={() => router.push("/(main)/card-states")} />
      ) : null}
    </Screen>
  );
}
