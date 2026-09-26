// The caller's own free windows, exactly as the matcher sees them (#191).
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { MyAvailabilityResponse, routes } from "@web/contract";
import { Txt, useTheme } from "../../ui";
import { api } from "../../lib/api";
import { windowsByDay } from "./availability";

export function MyAvailability() {
  const theme = useTheme();
  const [days, setDays] = useState<ReturnType<typeof windowsByDay> | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api(routes.myAvailability, MyAvailabilityResponse)
      .then(res => { if (!cancelled) setDays(windowsByDay(res.windows)); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Txt variant="title">Your free time this week</Txt>
      {error ? (
        <Txt color="danger">Couldn't load your free time.</Txt>
      ) : !days ? (
        <ActivityIndicator />
      ) : days.length === 0 ? (
        <Txt color="textMuted">No free time in the next week</Txt>
      ) : (
        days.map(({ day, times }) => (
          <View key={day} style={{ gap: theme.spacing.xs }}>
            <Txt variant="label">{day}</Txt>
            {times.map(time => <Txt key={time} variant="small" numeric>{time}</Txt>)}
          </View>
        ))
      )}
    </View>
  );
}
