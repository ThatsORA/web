// Owner: Andy — dev gallery: the event card in every state on stub fixtures (no backend needed).
import { Redirect } from "expo-router";
import { Fragment } from "react";
import { EmptyFeedCard, EventCard, FIXTURES, FindingCard, type CardActions } from "../../features/event-card";
import { Screen, Txt } from "../../ui";

const noop: CardActions = { vote: () => {}, ghostPass: () => {}, changeSpot: () => {} };

export default function CardStates() {
  if (!__DEV__) {
    return <Redirect href="/(main)" />;
  }

  return (
    <Screen eyebrow="Dev" title="Card states">
      <Txt variant="eyebrow">Finding a time</Txt>
      <FindingCard />
      <Txt variant="eyebrow">No plans yet</Txt>
      <EmptyFeedCard onAddFriends={() => {}} />
      {FIXTURES.map((f) => (
        <Fragment key={f.label}>
          <Txt variant="eyebrow">{f.label}</Txt>
          <EventCard card={f.card} actions={noop} swapped={f.swapped} />
        </Fragment>
      ))}
    </Screen>
  );
}

