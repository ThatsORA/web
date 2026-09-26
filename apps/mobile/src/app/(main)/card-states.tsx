// Owner: Andy — dev gallery: the event card in every state on stub fixtures (no backend needed).
import { Fragment } from "react";
import { Text } from "react-native";
import { EventCard, FIXTURES, FindingCard, type CardActions } from "../../features/event-card";
import { Screen, useTheme } from "../../ui";

const noop: CardActions = { vote: () => {}, ghostPass: () => {}, reportClosed: () => {} };

export default function CardStates() {
  const t = useTheme();
  const label = (s: string) => <Text style={{ color: t.colors.textMuted, fontSize: t.font.small }}>{s}</Text>;
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
