import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { EventsListResponse, MyAvailabilityResponse, routes } from "@web/contract";
import { Badge, Card, Txt, useTheme } from "../../ui";
import { api } from "../../lib/api";
import { ScheduleDayGroup, transformScheduleItems } from "./scheduleTransform";

export function UnifiedCalendarView() {
  const theme = useTheme();
  const router = useRouter();
  const [schedule, setSchedule] = useState<ScheduleDayGroup[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      api(routes.myAvailability, MyAvailabilityResponse).catch(() => ({ windows: [] })),
      api(routes.events, EventsListResponse).catch(() => ({ events: [] })),
    ])
      .then(([availRes, eventsRes]) => {
        if (!cancelled) {
          const grouped = transformScheduleItems(availRes.windows, eventsRes.events);
          setSchedule(grouped);
          setLoading(false);
        }
      })
      .catch((e) => {
        console.error("UnifiedCalendarView load error:", e);
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <View style={{ padding: theme.spacing.lg, alignItems: "center" }}>
        <ActivityIndicator size="large" color={theme.colors.link} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ padding: theme.spacing.md }}>
        <Txt color="danger">Failed to load schedule.</Txt>
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      {/* Legend Header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: theme.spacing.xs,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <Txt variant="title">Upcoming Schedule</Txt>
        <View style={{ flexDirection: "row", gap: theme.spacing.xs, alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 8, height: 8, borderRadius: theme.radius.pill, backgroundColor: theme.colors.textMuted }} />
            <Txt variant="small" color="textMuted">Busy</Txt>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginLeft: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: theme.radius.pill, backgroundColor: theme.colors.primary }} />
            <Txt variant="small" color="link">Hangout</Txt>
          </View>
        </View>
      </View>

      {!schedule || schedule.length === 0 ? (
        <Txt color="textMuted">No upcoming busy blocks or hangouts scheduled.</Txt>
      ) : (
        schedule.map((group) => (
          <View key={group.dateKey} style={{ gap: theme.spacing.xs }}>
            <Txt variant="label" color="textMuted">
              {group.dateLabel}
            </Txt>
            {group.items.map((item) => {
              if (item.type === "busy") {
                return (
                  <View
                    key={item.id}
                    style={{
                      padding: theme.spacing.sm,
                      borderRadius: theme.radius.sm,
                      backgroundColor: theme.colors.surfaceMuted,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      opacity: 0.8,
                    }}
                  >
                    <Txt variant="body" color="textMuted">
                      {item.title}
                    </Txt>
                    <Txt variant="small" color="textMuted" numeric>
                      {item.subtitle}
                    </Txt>
                  </View>
                );
              }

              // Prominently highlighted Web Hangout Block
              const isConfirmed = item.status === "confirmed";
              const badgeTone = isConfirmed ? "success" : item.status === "voting" ? "info" : "neutral";
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    if (item.eventId) {
                      router.push({ pathname: "/", params: { eventId: item.eventId } });
                    }
                  }}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.9 : 1.0,
                  })}
                >
                  <Card tint={!isConfirmed} brand={isConfirmed}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Txt variant="label" style={{ color: isConfirmed ? theme.colors.onPrimary : theme.colors.heading }}>
                        ✨ {item.title}
                      </Txt>
                      {item.status ? (
                        <Badge label={item.status.toUpperCase()} tone={isConfirmed ? "new" : badgeTone} />
                      ) : null}
                    </View>
                    <Txt variant="body" numeric style={{ color: isConfirmed ? theme.colors.onPrimary : theme.colors.primary }}>
                      {item.subtitle}
                    </Txt>
                    <View style={{ marginTop: theme.spacing.xs, flexDirection: "row", justifyContent: "flex-end" }}>
                      <Txt variant="small" style={{ color: isConfirmed ? theme.colors.onPrimary : theme.colors.link }}>
                        View Event Card →
                      </Txt>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        ))
      )}
    </View>
  );
}
