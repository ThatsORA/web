// Owner: Andy — dev gallery: the event card in every state on stub fixtures (no backend needed).
import { Fragment } from "react";
import { EventCard, FIXTURES, FindingCard, type CardActions } from "../../features/event-card";
import { Screen, Txt } from "../../ui";

const noop: CardActions = { vote: () => {}, ghostPass: () => {}, reportClosed: () => {} };

export default function CardStates() {
  const label = (s: string) => <Txt variant="eyebrow">{s}</Txt>;
  return (
    <Screen title="Card states">
      {label("Finding a time")}
      <FindingCard />
      {FIXTURES.map((f) => (
        <Fragment key={f.label}>
          {label(f.label)}
          <EventCard card={f.card} actions={noop} swapped={f.swapped} />
        </Fragment>
      ))}
    </Screen>
  );
}
